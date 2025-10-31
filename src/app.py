"""
VFP Python Flask Application
Maintains all API endpoints and functionality
Optimized for Azure App Service deployment
"""

import os
import sys
import logging
from pathlib import Path
import tempfile
import shutil
import zipfile
import io
import math
import numpy as np
import matplotlib.pyplot as plt
import threading
import time
import platform
import subprocess
import signal
from datetime import datetime
from scipy.interpolate import griddata




# Setup Python path for module imports
current_dir = Path(__file__).parent.absolute()
project_root = current_dir.parent
sys.path.insert(0, str(current_dir))
sys.path.insert(0, str(project_root))

# Azure App Service specific configuration
def configure_for_azure():
    """Configure paths and settings for Azure App Service"""
    if os.environ.get('WEBSITE_SITE_NAME'):  # Azure App Service indicator
        # Azure App Service paths
        home_dir = os.environ.get('HOME', '/home')
        site_root = os.environ.get('WEBSITE_SITE_ROOT', '/home/site/wwwroot')
        
        return {
            'is_azure': True,
            'project_root': Path(site_root),
            'data_root': Path(home_dir) / 'data',  # Persistent storage
            'temp_root': Path('/tmp')  # Temporary storage
        }
    else:
        # Local development
        return {
            'is_azure': False,
            'project_root': Path(__file__).parent.parent,
            'data_root': Path(__file__).parent.parent / 'data',
            'temp_root': Path(__file__).parent.parent / 'temp'
        }

# Update your existing path configuration
azure_config = configure_for_azure()

if azure_config['is_azure']:
    print("Detected Azure App Service environment")
    project_root = azure_config['project_root']
    DATA_ROOT = azure_config['data_root']
    TEMP_ROOT = azure_config['temp_root']
else:
    # Your existing Windows/development configuration
    if os.path.exists('C:\\') and platform.system().lower() == 'windows':
        # Windows environment (EC2 or local development)
        if os.path.exists('C:\\inetpub\\wwwroot'):
            project_root = Path('C:\\inetpub\\wwwroot\\VFP-Python')
        else:
            project_root = Path(__file__).parent.parent
        DATA_ROOT = project_root / 'data'
        print("Detected Windows environment")

    elif os.path.exists('/app'):
        # Docker container environment (fallback)
        project_root = Path('/app')
        DATA_ROOT = project_root / 'data'
        print("Detected Docker environment")

    elif os.environ.get('RENDER'):
        # Render environment (fallback)
        DATA_ROOT = Path('/opt/render/project/data')
        project_root = current_dir.parent
        print("Detected Render environment")
    
    else:
        # Development environment
        DATA_ROOT = project_root / 'data'
        print("Detected development environment")



# Configure paths for new structure - CREATE DIRECTORIES FIRST
UPLOAD_FOLDER = project_root / 'data' / 'uploads'
SIMULATIONS_FOLDER = project_root / 'data' / 'Simulations'
TOOLS_FOLDER = project_root / 'tools'
LOGS_FOLDER = project_root / 'logs'
TEMP_FOLDER = project_root / 'data' / 'temp'

# Ensure directories exist BEFORE setting up logging
UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)
SIMULATIONS_FOLDER.mkdir(parents=True, exist_ok=True)
TOOLS_FOLDER.mkdir(parents=True, exist_ok=True)
LOGS_FOLDER.mkdir(parents=True, exist_ok=True)
TEMP_FOLDER.mkdir(parents=True, exist_ok=True)

print(f"✓ Created directory structure:")
print(f"  - Upload folder: {UPLOAD_FOLDER}")
print(f"  - Simulations folder: {SIMULATIONS_FOLDER}")
print(f"  - Tools folder: {TOOLS_FOLDER}")
print(f"  - Logs folder: {LOGS_FOLDER}")
print(f"  - Temp folder: {TEMP_FOLDER}")


# Setup logging
try:
    class SafeFormatter(logging.Formatter):
        def format(self, record):
            try:
                return super().format(record)
            except (UnicodeEncodeError, UnicodeDecodeError):
                record.msg = str(record.msg).encode('ascii', 'replace').decode('ascii')
                return super().format(record)
    
    if os.environ.get('RENDER'):
        # Production: Log to stdout (Render captures this)
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setFormatter(SafeFormatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
        logging.basicConfig(level=logging.INFO, handlers=[console_handler])
    else:
        # Development: Log to both file and console
        file_handler = logging.FileHandler(LOGS_FOLDER / 'app.log', encoding='utf-8')
        file_handler.setFormatter(SafeFormatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setFormatter(SafeFormatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
        logging.basicConfig(level=logging.INFO, handlers=[file_handler, console_handler])
    
    logger = logging.getLogger(__name__)
    logger.info("[SUCCESS] Logging system initialized successfully")
    
except Exception as e:
    print(f"Warning: Could not set up logging: {e}")
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger(__name__)


# Flask imports
from flask import Flask, request, jsonify, send_file, render_template, flash, redirect, url_for
from flask_cors import CORS
from werkzeug.utils import secure_filename
from flask_socketio import emit

# Configuration imports
try:
    from src.config.socket_config import socket_config
    logger.info("[SUCCESS] Socket config imported successfully")
except ImportError as e:
    logger.error(f"ERROR: Could not import socket_config: {e}")
    sys.exit(1)

# VFP Processing modules - Updated imports for new structure
try:
    from modules.vfp_processing import runVFP as run
    from modules.vfp_processing import readGEO as rG
    from modules.vfp_processing.readVFP import readVIS, readCP, readFORCE, readFLOW
    logger.info("[SUCCESS] VFP processing modules imported successfully")
except ImportError as e:
    logger.error(f"ERROR: Could not import VFP modules: {e}")
    modules_path = current_dir / 'modules'
    if modules_path.exists():
        logger.info(f"Available modules in {modules_path}:")
        for item in modules_path.iterdir():
            logger.info(f"  - {item.name}")
    sys.exit(1)

# Global variables
current_process = None

# Initialize Flask app
app = Flask(__name__)
CORS(app, origins=['https://ramtarun02.github.io', 'http://localhost:3000'])

# Set Flask config
app.config['UPLOAD_FOLDER'] = str(UPLOAD_FOLDER)
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max file size

# Initialize SocketIO with the configuration
socketio = socket_config.init_app(app)

# Native Windows environment for execution
logger.info("Using native Windows environment - no Wine required")


def allowed_file(filename):
    """Check if the file has an allowed extension."""
    ALLOWED_EXTENSIONS = {'GEO', 'geo', 'VFP', 'vfp', 'DAT', 'dat', 'MAP', 'map', 'VIS', 'vis'}
    return '.' in filename and filename.rsplit('.', 1)[1] in ALLOWED_EXTENSIONS

def copy_files_to_folder(source_folder, destination_folder):
    """Copy files from source folder to destination folder."""
    try:
        import shutil
        source_path = Path(source_folder)
        dest_path = Path(destination_folder)
        
        if not source_path.exists():
            return f"Source folder {source_folder} does not exist"
        
        dest_path.mkdir(parents=True, exist_ok=True)
        copied_files = []
        
        for file_path in source_path.iterdir():
            if file_path.is_file():
                dest_file = dest_path / file_path.name
                shutil.copy2(file_path, dest_file)
                copied_files.append(file_path.name)
        
        return f"Copied {len(copied_files)} files from {source_folder} to {destination_folder}"
    except Exception as e:
        return f"Error copying files: {str(e)}"

def stream_bat_process_threaded(bat_file_path, cwd, args=None):
    """Stream output from a .bat file execution on Windows"""
    global current_process
    
    def run_bat_process():
        global current_process
        try:
            # Use app context for socketio.emit
            with app.app_context():
                # Ensure we're using the full path and proper command format
                if not os.path.isabs(bat_file_path):
                    bat_file_path_abs = os.path.abspath(bat_file_path)
                else:
                    bat_file_path_abs = bat_file_path
                
                socket_config.emit_message(f"Executing batch file: {bat_file_path_abs}")
                socket_config.emit_message(f"Working directory: {cwd}")
                socket_config.emit_message(f"Platform: {platform.system()}")
                
                if args:
                    socket_config.emit_message(f"Arguments: {' '.join(args)}")
                
                # Native Windows batch execution
                command = [bat_file_path_abs]
                if args:
                    command.extend(args)
                
                current_process = subprocess.Popen(
                    command,
                    cwd=cwd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    bufsize=1,
                    universal_newlines=True,
                    shell=True
                )
                socket_config.set_current_process(current_process)
                
                if current_process is None:
                    socket_config.emit_message("Failed to start batch process")
                    return

                # Stream output line-by-line with periodic heartbeats
                last_output_time = time.time()
                while True:
                    output = current_process.stdout.readline()
                    if output == '' and current_process.poll() is not None:
                        break
                    if output:
                        clean_line = output.strip()
                        logger.info(clean_line)
                        socket_config.emit_message(clean_line)
                        last_output_time = time.time()
                    else:
                        # Send heartbeat every 10 seconds if no output
                        current_time = time.time()
                        if current_time - last_output_time > 10:
                            socket_config.emit_heartbeat({'status': 'running', 'timestamp': current_time})
                            last_output_time = current_time
                        time.sleep(1)

                current_process.stdout.close()
                return_code = current_process.wait()
                
                if return_code == 0:
                    socket_config.emit_message('[DONE] Solver Run Complete')
                else:
                    socket_config.emit_message(f'Solver completed with return code: {return_code}')
                    socket_config.emit_message('Check the batch file for syntax errors or missing dependencies')

        except Exception as e:
            with app.app_context():
                socket_config.emit_message(f"Error during BAT execution: {str(e)}")
            logger.error(f"Full error details: {e}")
        finally:
            current_process = None
            socket_config.set_current_process(None)

    # Start the batch process in a separate thread
    thread = threading.Thread(target=run_bat_process)
    thread.daemon = True
    thread.start()

def stream_process_threaded(command, cwd):
    """Run process natively on Windows in a separate thread to avoid blocking WebSocket"""
    global current_process
    
    def run_process():
        global current_process
        try:
            # Use app context for socketio.emit
            with app.app_context():
                socket_config.emit_message(f"Starting process: {' '.join(command)}")
                socket_config.emit_message(f"Platform: {platform.system()}")
                env = os.environ.copy()
                env["PYTHONPATH"] = f"{project_root / 'src'};{project_root / 'modules'}"
                # Native Windows execution - no Wine needed
                current_process = subprocess.Popen(
                    command, 
                    stdout=subprocess.PIPE, 
                    stderr=subprocess.STDOUT, 
                    text=True, 
                    cwd=cwd,
                    env = env,
                    bufsize=1,  # Line buffered
                    universal_newlines=True
                )

                socket_config.set_current_process(current_process)

                if current_process is None:
                    socket_config.emit_message("Failed to start process")
                    return

                # Stream output line-by-line with periodic heartbeats
                last_output_time = time.time()
                while True:
                    output = current_process.stdout.readline()
                    if output == '' and current_process.poll() is not None:
                        break
                    if output:
                        clean_line = output.strip()
                        logger.info(clean_line)
                        socket_config.emit_message(clean_line)
                        last_output_time = time.time()
                    else:
                        # Send heartbeat every 5 seconds if no output
                        current_time = time.time()
                        if current_time - last_output_time > 5:
                            socket_config.emit_heartbeat({'status': 'running', 'timestamp': current_time})
                            last_output_time = current_time
                        time.sleep(1)

                current_process.stdout.close()
                return_code = current_process.wait()
                
                if return_code == 0:
                    socket_config.emit_message('[DONE] Process completed successfully')
                else:
                    socket_config.emit_message(f'Process completed with return code: {return_code}')

        except Exception as e:
            with app.app_context():
                socket_config.emit_message(f"Error during process execution: {str(e)}")
                if platform.system().lower() == 'linux':
                    socket_config.emit_message("Check Wine installation and configuration")
            logger.error(f"Process error: {e}")
        finally:
            current_process = None
            socket_config.set_current_process(None)

    # Start the process in a separate thread
    thread = threading.Thread(target=run_process)
    thread.daemon = True
    thread.start()

@app.route('/start-vfp', methods=['POST'])
def run_vfp():
    """Handle VFP simulation start request"""
    try:
        # Get form data
        mach = request.form.get("mach")
        aoa = request.form.get("aoa")
        reynolds = request.form.get("reynolds")
        continuation = request.form.get("continuation") == "true"
        excrescence = request.form.get("excrescence") == "true"
        autoRunner = request.form.get("autoRunner") == "true"
        mapImported = request.form.get("mapImported") == "true"
        geoImported = request.form.get("geoImported") == "true"
        datImported = request.form.get("datImported") == "true"
        simName = request.form.get("simName")

        # Create a directory to store uploaded files using new structure
        sim_folder = SIMULATIONS_FOLDER / simName
        sim_folder.mkdir(parents=True, exist_ok=True)

        # Save uploaded files
        files_received = {}
        for file_key, file in request.files.items():
            if file.filename:  # Ensure file is uploaded
                file_path = sim_folder / file.filename
                file.save(str(file_path))  # Save file
                files_received[file_key] = file.filename  # Store file names
        
        # Construct a response
        response = {
            "message": "VFP Run Starting! Here are your inputs:",
            "user_inputs": {
                "mach": mach,
                "aoa": aoa,
                "reynolds": reynolds,
                "Continuation Run": continuation,
                "Excrescence Run": excrescence,
                "AutoRunner": autoRunner,
                "Map File Imported": mapImported,
                "Geometry File Imported": geoImported,
                "Flow File Imported": datImported,
                "simName": simName,
            },
            "uploaded_files": files_received,
        }
        
        logger.info(f"VFP simulation started for {simName}")
        return jsonify(response)
        
    except Exception as e:
        logger.error(f"Error in run_vfp: {str(e)}")
        return jsonify({"error": str(e)}), 500

@socketio.on('connect')
def handle_connect():
    """Handle WebSocket client connection"""
    logger.info("Client connected")
    emit('message', "WebSocket connection established")

@socketio.on('disconnect')
def handle_disconnect():
    """Handle WebSocket client disconnection"""
    logger.info("Client disconnected")
    # Kill any running process if client disconnects
    global current_process
    if current_process:
        try:
            current_process.terminate()
            current_process = None
            logger.info("Terminated running process due to client disconnect")
        except Exception as e:
            logger.error(f"Error terminating process: {e}")

@socketio.on('ping')
def handle_ping():
    """Handle client ping to keep connection alive"""
    emit('pong', {'timestamp': time.time()})

@socketio.on('start_simulation')
def start_simulation(data=None):
    """Handle simulation start request via WebSocket"""
    if data and 'simName' in data:
        try: 
            # Retrieve the simulation name from the request
            sim_name = data['simName']

            if not sim_name:
                emit('error', "Simulation name not provided")
                return

            sim_folder = SIMULATIONS_FOLDER / sim_name

            if not sim_folder.exists():
                emit('error', f"Simulation folder '{sim_folder}' not found")
                return

            # Native Windows environment - no Wine checks needed
            emit('message', "Windows environment detected - ready to run Windows executables")

            # Get specific file names from client data
            map_filename = data.get('mapFile', '')
            geo_filename = data.get('geoFile', '')
            dat_filename = data.get('datFile', '')

            logger.info(f"Client provided files: map={map_filename}, geo={geo_filename}, dat={dat_filename}")

            # Validate that file names are provided
            if not map_filename or not geo_filename or not dat_filename:
                emit('error', f"Missing file names. Received: map='{map_filename}', geo='{geo_filename}', dat='{dat_filename}'")
                return

            # Check if the specified files exist in the simulation folder
            map_file_path = sim_folder / map_filename
            geo_file_path = sim_folder / geo_filename
            dat_file_path = sim_folder / dat_filename

            missing_files = []
            if not map_file_path.exists():
                missing_files.append(f"Map file: {map_filename}")
            if not geo_file_path.exists():
                missing_files.append(f"GEO file: {geo_filename}")
            if not dat_file_path.exists():
                missing_files.append(f"DAT file: {dat_filename}")

            if missing_files:
                emit('error', f"Missing files in simulation folder: {', '.join(missing_files)}")
                return

            emit('message', f"Found all required files: {map_filename}, {geo_filename}, {dat_filename}")

            # Remove file extensions for batch file arguments
            map_file = os.path.splitext(map_filename)[0]
            geo_file = os.path.splitext(geo_filename)[0]
            dat_file = os.path.splitext(dat_filename)[0]

            # Extract boolean values
            con = data.get("continuation", "false").lower() == "true"
            auto = data.get("autoRunner", "false").lower() == "true"
            exc = data.get("excrescence", "false").lower() == "true"
            dump = data.get("dump", "false").lower() == "true"
            
            dump_file = data.get('dumpName', '')
            if dump_file and '.' in dump_file:
                dump_file = os.path.splitext(dump_file)[0]

            logger.info(f"Configuration: con={con}, auto={auto}, exc={exc}, dump={dump}")
            logger.info(f"Files (without extensions): map={map_file}, geo={geo_file}, dat={dat_file}, dump={dump_file}")

            emit('message', f"Simulation started for {sim_name}")

            # Copy necessary files to simulation folder using Wine-compatible function
            tools_bin_folder = TOOLS_FOLDER / "vfp"
            utils_folder = project_root / "modules" / "utils"
            
            if tools_bin_folder.exists():
                emit('message', copy_files_to_folder(str(tools_bin_folder), str(sim_folder)))
            
            if utils_folder.exists():
                copy_files_to_folder(str(utils_folder), str(sim_folder))

            # Path to the batch file
            bat_file_path = sim_folder / "runvfphe_v4.bat"

            # Check if batch file exists
            if not bat_file_path.exists():
                emit('error', f"Batch file 'runvfphe_v4.bat' not found in {sim_folder}")
                return

            # Decision logic based on configuration
            if auto and not con and not exc:
                # Case 3: Auto runner mode
                emit('message', "Running in Auto Runner mode...")
                
                dalpha = data.get("dalpha", "1")
                alphaN = data.get("alphaN", "1")
                
                # Use threaded process to run VFP_Full_Process.py
                stream_process_threaded([
                    sys.executable, "VFP_Full_Process.py", 
                    dat_filename, dalpha, alphaN, map_file, geo_file
                ], str(sim_folder))

            elif con and not auto and not exc:
                # Case 2: Continuation mode
                emit('message', "Running in Continuation mode...")
                
                if dump_file:
                    dump_file_path = sim_folder / f"{dump_file}.fort52"
                    if not dump_file_path.exists():
                        emit('error', f"Dump file '{dump_file}.fort52' not found in simulation folder")
                        return
                    emit('message', f"Found dump file: {dump_file}.fort52")
                else:
                    emit('error', "Dump file name is required for continuation run")
                    return

                bat_args = [
                    map_file, geo_file, dat_file, "n", "y", dump_file
                ]
                emit('message', f"Batch arguments: {' '.join(bat_args)}")
                stream_bat_process_threaded(str(bat_file_path), str(sim_folder), bat_args)

            elif not con and not auto and not exc:
                # Case 1: Standard mode
                emit('message', "Running in Standard mode...")
                
                bat_args = [
                    map_file, geo_file, dat_file, "n", "n", ""
                ]
                emit('message', f"Batch arguments: {' '.join(bat_args)}")
                stream_bat_process_threaded(str(bat_file_path), str(sim_folder), bat_args)

            elif exc and not con and not auto:
                # Case 4: Excrescence mode
                emit('message', "Running in Excrescence mode...")
                
                bat_args = [
                    map_file, geo_file, dat_file, "y", "n", ""
                ]
                emit('message', f"Batch arguments: {' '.join(bat_args)}")
                stream_bat_process_threaded(str(bat_file_path), str(sim_folder), bat_args)

            else:
                # Handle invalid combinations
                if con and auto:
                    emit('error', "Cannot run both Continuation and Auto Runner simultaneously")
                elif con and exc:
                    emit('error', "Cannot run both Continuation and Excrescence simultaneously")
                elif auto and exc:
                    emit('error', "Cannot run both Auto Runner and Excrescence simultaneously")
                else:
                    emit('error', "Invalid configuration combination")

        except Exception as e:
            logger.error(f"Error processing simulation data: {e}")
            emit('error', f"Could not process simulation data: {str(e)}")
    else:
        logger.error("No simulation data provided or 'simName' missing")
        emit('error', "Simulation data missing required fields")

# Verify this exists in your src/app.py
@app.route('/health')
def health_check():
    """Health check endpoint for Azure App Service"""
    try:
        import psutil
        import platform
        from datetime import datetime
        
        # Check system resources
        memory = psutil.virtual_memory()
        
        # Azure-specific environment detection
        azure_env = {
            'is_azure': bool(os.environ.get('WEBSITE_SITE_NAME')),
            'site_name': os.environ.get('WEBSITE_SITE_NAME', 'Not set'),
            'site_root': os.environ.get('WEBSITE_SITE_ROOT', 'Not set'),
            'port': os.environ.get('PORT', os.environ.get('HTTP_PLATFORM_PORT', 'Not set'))
        }
        
        status = {
            'status': 'healthy',
            'timestamp': datetime.now().isoformat(),
            'environment': 'Azure App Service' if azure_env['is_azure'] else 'Development',
            'platform': platform.platform(),
            'python_version': platform.python_version(),
            'azure_info': azure_env,
            'system': {
                'memory_percent': memory.percent,
                'memory_available_mb': round(memory.available / 1024 / 1024, 2)
            },
            'directories': {
                'uploads_exists': UPLOAD_FOLDER.exists(),
                'simulations_exists': SIMULATIONS_FOLDER.exists(),
                'tools_exists': TOOLS_FOLDER.exists(),
                'logs_exists': LOGS_FOLDER.exists(),
                'temp_exists': TEMP_FOLDER.exists()
            },
            'features': {
                'native_windows': platform.system().lower() == 'windows',
                'socketio_enabled': True,
                'file_upload_enabled': True
            }
        }
        
        return jsonify(status), 200
        
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return jsonify({
            'status': 'unhealthy',
            'error': str(e),
            'timestamp': datetime.now().isoformat(),
            'environment': 'Azure App Service' if os.environ.get('WEBSITE_SITE_NAME') else 'Development'
        }), 500

# Add a simple test route for debugging
@app.route('/test')
def test_route():
    """Simple test route for debugging"""
    return jsonify({
        'message': 'Test route working',
        'timestamp': datetime.now().isoformat(),
        'working_directory': os.getcwd(),
        'environment_vars': {
            'WEBSITE_SITE_NAME': os.environ.get('WEBSITE_SITE_NAME'),
            'PORT': os.environ.get('PORT'),
            'HTTP_PLATFORM_PORT': os.environ.get('HTTP_PLATFORM_PORT')
        }
    })   
    # Windows native environment - no Wine needed
    status['windows_native'] = True
    status['platform'] = platform.system()
    
    return jsonify(status)

@socketio.on('stop_simulation')
def stop_simulation():
    """Allow client to stop running simulation"""
    global current_process
    if current_process:
        try:
            current_process.terminate()
            current_process = None
            emit('message', "Simulation stopped by user")
            logger.info("Simulation stopped by user")
        except Exception as e:
            emit('error', f"Error stopping simulation: {str(e)}")
            logger.error(f"Error stopping simulation: {str(e)}")
    else:
        emit('message', "No simulation currently running")

@app.route('/parse_cp', methods=['POST'])
def parse_cp():
    """
    Parse CP file using readVFP.readCP function
    Expects multipart/form-data with: file, fileName, simName
    Returns: Parsed CP data as JSON
    """
    try:
        print("=== DEBUG: parse_cp endpoint called ===")
        
        # Check if file is in request
        if 'file' not in request.files:
            print("DEBUG: No file in request")
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        file_name = request.form.get('fileName', file.filename)
        sim_name = request.form.get('simName', 'unknown')
        
        if file.filename == '':
            print("DEBUG: Empty filename")
            return jsonify({'error': 'No file selected'}), 400
        
        print(f"DEBUG: Processing file - fileName={file_name}, simName={sim_name}")
        
        # Create a temporary file to use with readCP function
        temp_file_path = f"{file_name}"
        print(f"DEBUG: Using temp file: {temp_file_path}")
        
        try:
            # Save uploaded file to temporary location
            file.save(temp_file_path)
            print("DEBUG: File saved to temporary location")
            
            # Use readCP function to parse the file
            print("DEBUG: Calling readCP function...")
            parsed_data = readCP(temp_file_path)
            print(f"DEBUG: readCP returned: {type(parsed_data)}")
            
            # Clean up temporary file
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)
                print("DEBUG: Temporary file cleaned up")
            
            if parsed_data is None:
                print("DEBUG: readCP returned None")
                return jsonify({'error': 'Failed to parse CP file - readCP returned None'}), 500
            
            print(f"Successfully parsed CP file: {file_name}")
            
            # Return the parsed data directly as JSON
            return jsonify(parsed_data), 200
            
        except Exception as file_error:
            print(f"DEBUG: File operation error: {str(file_error)}")
            # Clean up temporary file on error
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)
            raise file_error
            
    except Exception as e:
        print(f"DEBUG: General error in parse_cp: {str(e)}")
        import traceback
        print(f"DEBUG: Traceback: {traceback.format_exc()}")
        return jsonify({
            'error': f'Error parsing CP file: {str(e)}',
            'traceback': traceback.format_exc()
        }), 500

@app.route('/parse_forces', methods=['POST'])
def parse_forces():
    """
    Parse Forces file using readVFP.readFORCE function
    Expects multipart/form-data with: file, fileName, simName
    Returns: Parsed Forces data as JSON
    """
    try:
        print("=== DEBUG: parse_forces endpoint called ===")
        
        # Check if file is in request
        if 'file' not in request.files:
            print("DEBUG: No file in request")
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        file_name = request.form.get('fileName', file.filename)
        sim_name = request.form.get('simName', 'unknown')
        
        if file.filename == '':
            print("DEBUG: Empty filename")
            return jsonify({'error': 'No file selected'}), 400
        
        print(f"DEBUG: Processing file - fileName={file_name}, simName={sim_name}")
        
        # Create a temporary file to use with readFORCE function
        temp_file_path = f"temp_{sim_name}_{file_name}"
        print(f"DEBUG: Using temp file: {temp_file_path}")
        
        try:
            # Save uploaded file to temporary location
            file.save(temp_file_path)
            print("DEBUG: File saved to temporary location")
            
            # Use readFORCE function to parse the file
            print("DEBUG: Calling readFORCE function...")
            parsed_data = readFORCE(temp_file_path)
            print(f"DEBUG: readFORCE returned: {type(parsed_data)}")
            
            # Clean up temporary file
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)
                print("DEBUG: Temporary file cleaned up")
            
            if parsed_data is None:
                print("DEBUG: readFORCE returned None")
                return jsonify({'error': 'Failed to parse Forces file - readFORCE returned None'}), 500
            
            print(f"Successfully parsed Forces file: {file_name}")
            
            # Return the parsed data directly as JSON
            return jsonify(parsed_data), 200
            
        except Exception as file_error:
            print(f"DEBUG: File operation error: {str(file_error)}")
            # Clean up temporary file on error
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)
            raise file_error
            
    except Exception as e:
        print(f"DEBUG: General error in parse_forces: {str(e)}")
        import traceback
        print(f"DEBUG: Traceback: {traceback.format_exc()}")
        return jsonify({
            'error': f'Error parsing Forces file: {str(e)}',
            'traceback': traceback.format_exc()
        }), 500

@app.route('/parse_dat', methods=['POST'])
def parse_dat():
    """
    Parse DAT file using readVFP.readFLOW function
    Expects multipart/form-data with: file, fileName, simName
    Returns: Parsed DAT data as JSON
    """
    try:
        print("=== DEBUG: parse_dat endpoint called ===")
        
        # Check if file is in request
        if 'file' not in request.files:
            print("DEBUG: No file in request")
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        file_name = request.form.get('fileName', file.filename)
        sim_name = request.form.get('simName', 'unknown')
        
        if file.filename == '':
            print("DEBUG: Empty filename")
            return jsonify({'error': 'No file selected'}), 400
        
        print(f"DEBUG: Processing file - fileName={file_name}, simName={sim_name}")
        
        # Create a temporary file to use with readFLOW function
        temp_file_path = f"temp_{sim_name}_{file_name}"
        print(f"DEBUG: Using temp file: {temp_file_path}")
        
        try:
            # Save uploaded file to temporary location
            file.save(temp_file_path)
            print("DEBUG: File saved to temporary location")
            
            # Use readFLOW function to parse the file
            print("DEBUG: Calling readFLOW function...")
            parsed_data = readFLOW(temp_file_path)
            print(f"DEBUG: readFLOW returned: {type(parsed_data)}")
            
            # Clean up temporary file
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)
                print("DEBUG: Temporary file cleaned up")
            
            if parsed_data is None:
                print("DEBUG: readFLOW returned None")
                return jsonify({'error': 'Failed to parse DAT file - readFLOW returned None'}), 500
            
            print(f"Successfully parsed DAT file: {file_name}")
            
            # Return the parsed data directly as JSON
            return jsonify(parsed_data), 200
            
        except Exception as file_error:
            print(f"DEBUG: File operation error: {str(file_error)}")
            # Clean up temporary file on error
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)
            raise file_error
            
    except Exception as e:
        print(f"DEBUG: General error in parse_dat: {str(e)}")
        import traceback
        print(f"DEBUG: Traceback: {traceback.format_exc()}")
        return jsonify({
            'error': f'Error parsing DAT file: {str(e)}',
            'traceback': traceback.format_exc()
        }), 500



@app.route('/boundary_layer_data', methods=['POST'])
def boundary_layer_data():
    """Process VIS file for boundary layer data"""
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if not file.filename.lower().endswith('.vis'):
            return jsonify({'error': 'Please select a .vis file'}), 400
        
        # Save temporary file in uploads folder using new structure
        temp_filename = UPLOAD_FOLDER / f"temp_{secure_filename(file.filename)}"
        file.save(str(temp_filename))
        
        try:
            # Use readVIS function from readVFP.py
            vis_data = readVIS(str(temp_filename))
            
            logger.info(f"Successfully processed VIS file: {file.filename}")
            return jsonify(vis_data)
            
        except Exception as e:
            logger.error(f"Error processing VIS file: {str(e)}")
            raise e
            
        finally:
            # Clean up temp file
            if temp_filename.exists():
                temp_filename.unlink()
            
    except Exception as e:
        logger.error(f"Error in boundary_layer_data: {str(e)}")
        return jsonify({'error': f'Error processing VIS file: {str(e)}'}), 500
    

def clean_grid(arr):
    arr = np.array(arr)
    arr = np.where(np.isnan(arr) | np.isinf(arr), None, arr)
    return arr.tolist()


@app.route('/contour_grid', methods=['POST'])
def contour_grid():
    data = request.get_json()
    cp_data = data['cp_data']
    level = data['level']
    contour_type = data['contour_type']
    surface_type = data['surface_type']
    threshold = data.get('threshold', 0)
    n_grid = data.get('n_grid', 150)

    level_data = cp_data['levels'][level]
    sections = level_data['sections']

    x_list = []
    y_list = []
    val_list = []

    for sec in sections.values():
        x_vals = sec.get('XPHYS', [])
        vals = sec.get(contour_type, [])
        yave = sec.get('coefficients', {}).get('YAVE')
        if yave is None:
            import re
            m = re.search(r'YAVE=\s*([\d.-]+)', sec.get('sectionHeader', ''))
            yave = float(m.group(1)) if m else None
        if yave is not None and x_vals and vals and len(x_vals) == len(vals):
            min_idx = x_vals.index(min(x_vals))
            top_idx = len(x_vals) - 1
            if surface_type == "upper":
                indices = range(min_idx, top_idx + 1)
            elif surface_type == "lower":
                indices = range(0, min_idx + 1)
            else:
                indices = []
            for i in indices:
                v = vals[i]
                if v >= threshold:
                    x_list.append(x_vals[i])
                    y_list.append(yave)
                    val_list.append(v)

    x_arr = np.array(x_list)
    y_arr = np.array(y_list)
    val_arr = np.array(val_list)

    # Create grid for contour plot
    xi = np.linspace(np.min(x_arr), np.max(x_arr), n_grid)
    yi = np.linspace(np.min(y_arr), np.max(y_arr), n_grid)
    xi, yi = np.meshgrid(xi, yi)
    zi = griddata((x_arr, y_arr), val_arr, (xi, yi), method='linear')

    # Convert to lists for JSON serialization
    x_grid = clean_grid(xi)
    y_grid = clean_grid(yi)
    z_grid = clean_grid(zi)

    return jsonify({"x": x_grid, "y": y_grid, "z": z_grid})


@app.route('/interpolate_parameter', methods=['POST'])
def interpolate_parameter():
    """Handle parameter interpolation for geometry modification"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        geo_data = data.get('geoData')
        plot_data = data.get('plotData')
        parameter = data.get('parameter')
        start_section = data.get('startSection')  # 0-based index
        end_section = data.get('endSection')      # 0-based index
        a_value = data.get('aValue', 0)
        
        if not geo_data:
            return jsonify({'error': 'No geoData provided'}), 400
        
        if parameter not in ['Twist', 'Dihedral', 'XLE']:
            return jsonify({'error': f'Invalid parameter: {parameter}'}), 400
        
        if start_section < 0 or end_section < 0 or start_section > end_section:
            return jsonify({'error': 'Invalid section range'}), 400
        
        if start_section >= len(geo_data) or end_section >= len(geo_data):
            return jsonify({'error': 'Section index out of range'}), 400
        
        logger.info(f"Interpolating {parameter} from section {start_section} to {end_section} with a={a_value}")
        
        # Map parameter names to geoData keys
        param_key_map = {
            'Twist': 'TWIST',
            'Dihedral': 'HSECT', 
            'XLE': 'G1SECT'
        }
        
        geo_key = param_key_map[parameter]
        
        # Get start and end values
        start_value = geo_data[start_section][geo_key]
        end_value = geo_data[end_section][geo_key]
        
        # Number of sections to interpolate
        num_sections = end_section - start_section + 1
        
        logger.info(f"Interpolating from {start_value} to {end_value} over {num_sections} sections")
        
        # Perform interpolation
        if abs(a_value) < 1e-10:  # Linear interpolation when a ≈ 0
            logger.info("Performing linear interpolation")
            for i in range(num_sections):
                section_idx = start_section + i
                if num_sections == 1:
                    # Single section, no interpolation needed
                    continue
                
                # Linear interpolation: y = mx + b
                t = i / (num_sections - 1)  # Parameter from 0 to 1
                interpolated_value = start_value + t * (end_value - start_value)
                
                geo_data[section_idx][geo_key] = interpolated_value
                logger.debug(f"Section {section_idx}: {geo_key} = {interpolated_value}")
        
        else:  # Quadratic interpolation when a ≠ 0
            logger.info(f"Performing quadratic interpolation with a = {a_value}")
            
            # For quadratic interpolation y = ax² + bx + c
            # We need to solve for b and c using boundary conditions:
            # At x=0: y = start_value → c = start_value
            # At x=1: y = end_value → a + b + c = end_value → b = end_value - a - c
            
            c = start_value
            b = end_value - a_value - c
            
            logger.info(f"Quadratic coefficients: a={a_value}, b={b}, c={c}")
            
            for i in range(num_sections):
                section_idx = start_section + i
                if num_sections == 1:
                    # Single section, no interpolation needed
                    continue
                
                # Normalize x to [0, 1] range
                x = i / (num_sections - 1) if num_sections > 1 else 0
                
                # Calculate quadratic interpolation: y = ax² + bx + c
                interpolated_value = a_value * x * x + b * x + c
                
                geo_data[section_idx][geo_key] = interpolated_value
                logger.debug(f"Section {section_idx}: x={x}, {geo_key} = {interpolated_value}")
        
        # Handle special case for XLE parameter - need to update chord accordingly
        if parameter == 'XLE':
            logger.info("Updating XTE (G2SECT) to maintain chord length for XLE changes")
            for i in range(start_section, end_section + 1):
                # Calculate current chord
                current_chord = geo_data[i]['G2SECT'] - geo_data[i]['G1SECT']
                # Update G2SECT to maintain chord length
                geo_data[i]['G2SECT'] = geo_data[i]['G1SECT'] + current_chord
                logger.debug(f"Section {i}: Updated G2SECT to {geo_data[i]['G2SECT']} (chord={current_chord})")
        
        # Regenerate plot data after geometry changes
        import copy
        updated_plot_data = rG.airfoils(copy.deepcopy(geo_data))
        
        # For twist changes, apply rotation to plot data
        if parameter == 'Twist':
            logger.info("Applying twist transformations to plot data")
            
            for section_idx in range(start_section, end_section + 1):
                current_twist = geo_data[section_idx]['TWIST']
                logger.debug(f"Section {section_idx}: Applied twist = {current_twist}°")
        
        # For dihedral changes, the plot data is already updated through rG.airfoils()
        if parameter == 'Dihedral':
            logger.info("Dihedral changes applied through geometry regeneration")
        
        logger.info("Interpolation completed successfully")
        
        return jsonify({
            'updatedGeoData': geo_data,
            'updatedPlotData': updated_plot_data
        })
    
    except Exception as e:
        logger.error(f"Error in interpolate_parameter: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@socketio.on('download')
def handle_download(data):
    """Handle simulation folder download via WebSocket"""
    try:
        sim_name = data.get('simName')
        if not sim_name:
            emit('message', "Error: Simulation name missing.")
            return

        sim_folder = SIMULATIONS_FOLDER / sim_name
        if not sim_folder.exists():
            emit('message', f"Error: Simulation folder '{sim_name}' not found.")
            return

        # Create an in-memory zip file
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zipf:
            for root, _, files in os.walk(str(sim_folder)):
                for file in files:
                    file_path = os.path.join(root, file)
                    arcname = os.path.relpath(file_path, str(sim_folder))
                    zipf.write(file_path, arcname)

        zip_buffer.seek(0)  # Reset buffer position

        # Send the zip file as binary data
        emit('download_ready', {'simName': sim_name, 'fileData': zip_buffer.getvalue()})
        logger.info(f"Download prepared for simulation: {sim_name}")

    except Exception as e:
        emit('message', f"Error during download: {str(e)}")
        logger.error(f"Error in handle_download: {str(e)}")

@socketio.on('get_simulation_folder')
def handle_get_simulation_folder(data):
    """Get simulation folder contents via WebSocket"""
    try:
        sim_name = data.get('simName')
        
        if not sim_name:
            emit('error', {'type': 'simulation_folder_error', 'message': 'Simulation name not provided'})
            return
        
        sim_folder_path = SIMULATIONS_FOLDER / sim_name
        
        if not sim_folder_path.exists():
            emit('error', {'type': 'simulation_folder_error', 'message': f'Simulation folder {sim_name} not found'})
            return
        
        # Get all files in the simulation folder
        files = []
        for root, dirs, filenames in os.walk(str(sim_folder_path)):
            for filename in filenames:
                file_path = os.path.join(root, filename)
                relative_path = os.path.relpath(file_path, str(sim_folder_path))
                file_size = os.path.getsize(file_path)
                file_modified = os.path.getmtime(file_path)
                
                files.append({
                    'name': filename,
                    'path': relative_path,
                    'size': file_size,
                    'modified': file_modified,
                    'isDirectory': False
                })
            
            # Add directories
            for dirname in dirs:
                dir_path = os.path.join(root, dirname)
                relative_path = os.path.relpath(dir_path, str(sim_folder_path))
                
                files.append({
                    'name': dirname,
                    'path': relative_path,
                    'size': 0,
                    'modified': os.path.getmtime(dir_path),
                    'isDirectory': True
                })
        
        emit('simulation_folder_ready', {
            'success': True,
            'data': {
                'simName': sim_name,
                'folderPath': str(sim_folder_path),
                'files': files
            },
            'simName': sim_name
        })
        
        logger.info(f"Simulation folder contents sent for: {sim_name}")
        
    except Exception as e:
        logger.error(f"Error getting simulation folder: {str(e)}")
        emit('error', {
            'type': 'simulation_folder_error',
            'message': str(e)
        })
    
@app.route('/get_file_content', methods=['POST'])
def get_file_content():
    """Get file content from simulation folder"""
    try:
        data = request.get_json()
        sim_name = data.get('simName')
        file_path = data.get('filePath')
        
        if not sim_name or not file_path:
            return jsonify({'error': 'Missing simName or filePath'}), 400
        
        # Construct full path using new structure
        full_path = SIMULATIONS_FOLDER / sim_name / file_path
        
        # Security check - ensure path is within simulations directory
        abs_sim_path = (SIMULATIONS_FOLDER / sim_name).resolve()
        abs_file_path = full_path.resolve()
        
        if not str(abs_file_path).startswith(str(abs_sim_path)):
            return jsonify({'error': 'Invalid file path'}), 403
        
        if not full_path.exists():
            return jsonify({'error': 'File not found'}), 404
        
        # Read and return file content
        with open(full_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        
        logger.info(f"File content retrieved: {sim_name}/{file_path}")
        return content, 200, {'Content-Type': 'text/plain; charset=utf-8'}
        
    except Exception as e:
        logger.error(f"Error reading file: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/import-geo', methods=['POST'])
def import_geo():
    """Import and process GEO geometry files"""
    try:
        # Check if files were uploaded
        if 'files' not in request.files:
            return jsonify({'error': 'No files uploaded'}), 400

        files = request.files.getlist('files')
        
        if not files or all(file.filename == '' for file in files):
            return jsonify({'error': 'No files selected'}), 400

        results = []
        
        for file in files:
            if file.filename == '':
                continue
                
            # Save the file to the upload folder using new structure
            filename = secure_filename(file.filename)
            file_path = UPLOAD_FOLDER / filename
            file.save(str(file_path))

            logger.info(f"Processing GEO file: {file_path}")

            try:
                # Pass the file to the readGEO function
                geo_data = rG.readGEO(str(file_path))
                import copy
                points = rG.airfoils(copy.deepcopy(geo_data))
                
                # Add file info to results
                results.append({
                    'filename': filename,
                    'geoData': geo_data,
                    'plotData': points
                })
                
                logger.info(f"Successfully processed GEO file: {filename}")

            except Exception as e:
                logger.error(f"Error processing GEO file {filename}: {str(e)}")
                results.append({
                    'filename': filename,
                    'error': f'Error processing file: {str(e)}'
                })

            finally:
                # Clean up: Delete the uploaded file after processing
                if file_path.exists():
                    file_path.unlink()

        # Return the JSON response with all results
        return jsonify({'results': results}), 200
        
    except Exception as e:
        logger.error(f"Error in import_geo: {str(e)}")
        return jsonify({'error': str(e)}), 500

def compute_KS0D(CL0, CD0, A):
    """Compute KS0D parameter for ProWim calculations"""
    CL0 = np.array(CL0, dtype=float)
    CD0 = np.array(CD0, dtype=float)
    val = 1 - np.sqrt(((2 * CL0) / (math.pi * A)) ** 2 + (1 - (2 * CD0) / (math.pi * A)) ** 2)
    return np.round(val, 3)

def compute_TS0D(CL0, CD0, A):
    """Compute TS0D parameter for ProWim calculations"""
    CL0 = np.array(CL0, dtype=float)
    CD0 = np.array(CD0, dtype=float)    
    val = np.degrees(np.arctan((2 * CL0 / (math.pi * A)) / (1 - (2 * CD0 / (math.pi * A)))))
    return np.round(val, 3)

@app.route("/prowim-compute", methods=["POST"])
def compute():
    """Handle ProWim computation requests"""
    try:
        data = request.get_json()
        if data is None:
            return jsonify({"error": "Invalid or missing JSON"}), 400

        logger.info("ProWim computation requested")

        # Scalars
        A = float(data["A"])
        bOverD = float(data["bOverD"])
        cOverD = float(data["cOverD"])
        alpha0 = float(data["alpha0"])
        N = float(data["N"])
        NSPSW = float(data["NSPSW"])
        ZPD = float(data["ZPD"])
        IW = float(data["IW"])
        CT = float(data["CTIP"])
        NELMNT = float(data["NELMNT"])

        # Arrays - ensure they are lists
        CL0 = np.array(data["CL0"], dtype=float)
        CD0 = np.array(data["CD0"], dtype=float)
        KS00 = np.array(data["KS00"], dtype=float)
        ALFAWI = np.array(data["ALFAWI"], dtype=float)

        logger.info(f"Array lengths - CL0: {len(CL0)}, CD0: {len(CD0)}, KS00: {len(KS00)}, ALFAWI: {len(ALFAWI)}")

        KS0D = compute_KS0D(CL0, CD0, A)
        TS0D = compute_TS0D(CL0, CD0, A)

        Hzp = round((1 - 2.5 * abs(ZPD)), 2)
        Kdc = round((-1.630 * cOverD ** 2 + 2.3727 * cOverD + 0.0038), 2)
        Izp = round((455.93 * ZPD ** 6 - 10.67 * ZPD**5 - 87.221 * ZPD**4 -
               3.2742 * ZPD**3 + 0.2309 * ZPD**2 + 0.0418 * ZPD + 1.0027))
        TS0Ap0_1d = -2 * Kdc * alpha0
        TS10 = Hzp * TS0Ap0_1d + 1.15 * Kdc * Izp * IW + (ALFAWI - IW)
        theta_s = TS0D + (CT + 0.3 * np.sin(math.pi * CT ** 1.36)) * (TS10 - TS0D)
        ks = KS0D + CT * (KS00 - KS0D)
        r = math.sqrt(1 - CT)

        theta_rad = np.radians(theta_s)
        TS0D_rad = np.radians(TS0D)
        alpha_p = ALFAWI - IW

        CZ = ((1 + r) * (1 - ks) * np.sin(theta_rad) +
              ((2 / N) * bOverD ** 2 - (1 + r)) * r ** 2 *
              (1 - KS00) * np.sin(TS0D_rad))

        CZwf = CZ - CT * np.sin(np.radians(alpha_p))
        CZDwf = CZwf * NSPSW / (1 - CT)
        CZD = CZ * NSPSW / (1 - CT)

        CX = ((1 + r) * ((1 - ks) * np.cos(theta_rad) - r) +
              ((2 / N) * bOverD ** 2 - (1 + r)) * r ** 2 *
              ((1 - KS00) * np.cos(TS0D_rad) - 1))

        CXwf = CX - CT * np.cos(np.radians(alpha_p))
        CXDwf = CXwf * NSPSW / (1 - CT)
        CXD = -(CX * NSPSW / (1 - CT))

        # Prepare results as list of dicts - ensure all values are converted to Python types
        results = []
        for i in range(len(CL0)):
            result_item = {
                "KS0D": float(KS0D[i]) if isinstance(KS0D[i], np.floating) else float(KS0D[i]),
                "TS0D": float(TS0D[i]) if isinstance(TS0D[i], np.floating) else float(TS0D[i]),
                "theta_s": float(theta_s[i]) if isinstance(theta_s[i], np.floating) else float(theta_s[i]),
                "ks": float(ks[i]) if isinstance(ks[i], np.floating) else float(ks[i]),
                "CZ": float(CZ[i]) if isinstance(CZ[i], np.floating) else float(CZ[i]),
                "CZwf": float(CZwf[i]) if isinstance(CZwf[i], np.floating) else float(CZwf[i]),
                "CZDwf": float(CZDwf[i]) if isinstance(CZDwf[i], np.floating) else float(CZDwf[i]),
                "CZD": float(CZD[i]) if isinstance(CZD[i], np.floating) else float(CZD[i]),
                "CX": float(CX[i]) if isinstance(CX[i], np.floating) else float(CX[i]),
                "CXwf": float(CXwf[i]) if isinstance(CXwf[i], np.floating) else float(CXwf[i]),
                "CXDwf": float(CXDwf[i]) if isinstance(CXDwf[i], np.floating) else float(CXDwf[i]),
                "CXD": float(CXD[i]) if isinstance(CXD[i], np.floating) else float(CXD[i])
            }
            results.append(result_item)

        logger.info(f"Computed {len(results)} ProWim results")
        
        response = {"results": results}
        return jsonify(response)

    except Exception as e:
        logger.error(f"Error in prowim-compute: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/compute_desired', methods=['POST'])
def compute_desired():
    """Compute desired geometry modifications"""
    try:
        data = request.get_json()
        section_index = data['sectionIndex']
        parameters = data['parameters']
        geo_data = data['geoData']
        plot_data = data['plotData']

        logger.info(f"Computing desired parameters for section {section_index}")
        logger.debug(f"Parameters received: {parameters}")

        sec = section_index
        i = sec  # converting to 0-based index

        # Extract current section data
        current_section = geo_data[i]
        
        # Calculate current chord
        chord = current_section['G2SECT'] - current_section['G1SECT']
        
        # Extract new parameters
        new_xle = float(parameters.get('XLE', current_section['G1SECT']))
        new_xte = float(parameters.get('XTE', current_section['G2SECT'])) 
        new_twist = float(parameters.get('Twist', current_section['TWIST']))
        new_dihedral = float(parameters.get('Dihedral', current_section['HSECT']))
        new_ysect = float(parameters.get('YSECT', current_section['YSECT']))
        new_chord = float(parameters.get('Chord', chord))

        # Check if geometry parameters (YSECT, XLE, XTE) have changed
        geometry_changed = False
        
        if 'YSECT' in parameters and abs(new_ysect - current_section['YSECT']) > 1e-5:
            current_section['YSECT'] = new_ysect
            geometry_changed = True
            logger.info(f"Updated YSECT to {new_ysect}")
        
        if 'XLE' in parameters and abs(new_xle - current_section['G1SECT']) > 1e-5:
            current_section['G1SECT'] = new_xle
            geometry_changed = True
            logger.info(f"Updated XLE (G1SECT) to {new_xle}")
        
        if 'XTE' in parameters and abs(new_xte - current_section['G2SECT']) > 1e-5:
            current_section['G2SECT'] = new_xte
            geometry_changed = True
            logger.info(f"Updated XTE (G2SECT) to {new_xte}")

        # If chord was modified, update XTE based on XLE + chord
        if 'Chord' in parameters and abs(new_chord - chord) > 1e-5:
            current_section['G2SECT'] = current_section['G1SECT'] + new_chord
            geometry_changed = True
            logger.info(f"Updated chord to {new_chord}, XTE (G2SECT) to {current_section['G2SECT']}")

        # Step 1: Generate plot data from updated geoData (if geometry changed)
        if geometry_changed:
            plot_data = rG.airfoils(geo_data)
            logger.info("Regenerated plot data due to geometry changes")
            section_plot_data = plot_data[i]
            section_plot_data['xus_n'] = section_plot_data['xus']
            section_plot_data['zus_n'] = section_plot_data['zus']
            section_plot_data['xls_n'] = section_plot_data['xls']
            section_plot_data['zls_n'] = section_plot_data['zls']

        
        # Step 2: Apply rotation/translation for twist and dihedral changes in plotData
        twist_changed = 'Twist' in parameters and abs(new_twist - current_section['TWIST']) > 1e-4
        dihedral_changed = 'Dihedral' in parameters and abs(new_dihedral - current_section['HSECT']) > 1e-4
        logger.info(f"Twist changed: {twist_changed}, Dihedral changed: {dihedral_changed}")

        if twist_changed or dihedral_changed:
            logger.info("Applying twist/dihedral transformations to plot data")
            section_plot_data = plot_data[i]

            # Always apply dihedral first
            if dihedral_changed:
                logger.info(f"Applying dihedral change: {current_section['HSECT']} -> {new_dihedral}")
                delta_z = new_dihedral - current_section['HSECT']
                logger.info(f"Dihedral z-increment: {delta_z}")

                # Shift upper surface z-coordinates
                zus_dihedral = [z + delta_z for z in section_plot_data['zus']]
                # Shift lower surface z-coordinates
                zls_dihedral = [z + delta_z for z in section_plot_data['zls']]

                # Store dihedral-shifted coordinates
                section_plot_data['zus_n'] = zus_dihedral
                section_plot_data['zls_n'] = zls_dihedral
                section_plot_data['xus_n'] = section_plot_data['xus']
                section_plot_data['xls_n'] = section_plot_data['xls']
            else:
                # If no dihedral change, start with original coordinates
                section_plot_data['zus_n'] = section_plot_data['zus']
                section_plot_data['zls_n'] = section_plot_data['zls']
                section_plot_data['xus_n'] = section_plot_data['xus']
                section_plot_data['xls_n'] = section_plot_data['xls']

            # Then apply twist if needed, on top of dihedral-modified coordinates
            if twist_changed:
                current_twist_deg = current_section['TWIST']
                dtwist_rad = (new_twist - current_twist_deg) * (math.pi / 180)
                logger.info(f"Applying twist change: {current_twist_deg}° -> {new_twist}° (Δ={dtwist_rad} rad)")

                # Apply rotation to upper surface
                xus_rotated = []
                zus_rotated = []
                for j in range(len(section_plot_data['xus_n'])):
                    x = section_plot_data['xus_n'][j]
                    z = section_plot_data['zus_n'][j]
                    x_rot = x * math.cos(-dtwist_rad) - z * math.sin(-dtwist_rad)
                    z_rot = x * math.sin(-dtwist_rad) + z * math.cos(-dtwist_rad)
                    xus_rotated.append(x_rot)
                    zus_rotated.append(z_rot)

                # Apply rotation to lower surface
                xls_rotated = []
                zls_rotated = []
                for j in range(len(section_plot_data['xls_n'])):
                    x = section_plot_data['xls_n'][j]
                    z = section_plot_data['zls_n'][j]
                    x_rot = x * math.cos(-dtwist_rad) - z * math.sin(-dtwist_rad)
                    z_rot = x * math.sin(-dtwist_rad) + z * math.cos(-dtwist_rad)
                    xls_rotated.append(x_rot)
                    zls_rotated.append(z_rot)

                # Overwrite with twist-modified coordinates
                section_plot_data['xus_n'] = xus_rotated
                section_plot_data['zus_n'] = zus_rotated
                section_plot_data['xls_n'] = xls_rotated
                section_plot_data['zls_n'] = zls_rotated

                
        # Step 3: Update the geoData with new twist/dihedral values
        if twist_changed:
            current_section['TWIST'] = new_twist
            logger.info(f"Updated TWIST in geoData to {new_twist}")
        
        if dihedral_changed:
            current_section['HSECT'] = new_dihedral
            logger.info(f"Updated HSECT (Dihedral) in geoData to {new_dihedral}")

        # Step 4: Return updated geoData and plotData
        logger.info("Geometry computation completed successfully")
        return jsonify({
            'updatedGeoData': geo_data,
            'updatedPlotData': plot_data
        })
        
    except Exception as e:
        logger.error(f"Error in compute_desired: {str(e)}")
        return jsonify({'error': str(e)}), 500
    


@app.route('/fpcon', methods=['POST'])
def fpcon():
    try:
        # Get form data
        geoName = request.form.get('geoName')
        aspectRatio = request.form.get('aspectRatio')
        taperRatio = request.form.get('taperRatio')
        sweepAngle = request.form.get('sweepAngle')
        nsect = int(request.form.get('nsect', 1))
        nchange = int(request.form.get('nchange', 0))
        changeSections_raw = request.form.getlist('changeSections[]') or request.form.get('changeSections', '')

        # Split by comma or dot, flatten and clean
        if isinstance(changeSections_raw, list) and changeSections_raw:
            changeSections = []
            for val in changeSections_raw:
                # Split by comma or dot
                for part in val.replace(',', '.').split('.'):
                    part = part.strip()
                    if part:
                        changeSections.append(part)
        else:
            changeSections = []
            for part in str(changeSections_raw).replace(',', '.').split('.'):
                part = part.strip()
                if part:
                    changeSections.append(part)


        
        etas = request.form.getlist('etas[]') or request.form.get('etas', '').split(',')
        hsect = request.form.getlist('hsect[]') or request.form.get('hsect', '').split(',')
        xtwsec = request.form.getlist('xtwsec[]') or request.form.get('xtwsec', '').split(',')
        twsin = request.form.getlist('twsin[]') or request.form.get('twsin', '').split(',')
        body_radius = request.form.get('bodyRadius', '0.0')
        clcd_conv = request.form.get('clcd_conv', 'n')
        mach = request.form.get('mach', '0.0')
        incidence = request.form.get('incidence', '0.0')

        # Create upload directory
        upload_dir = UPLOAD_FOLDER / geoName
        upload_dir.mkdir(parents=True, exist_ok=True)

        # Save uploaded files
        file_names = []
        for file_key in request.files:
            file = request.files[file_key]
            if file.filename:
                filename = secure_filename(file.filename)
                file.save(os.path.join(upload_dir, filename))
                file_names.append(filename)

        # Write EXIN1.dat
        exin1_path = upload_dir / "EXIN1.DAT"
        with open(exin1_path, "w") as f:
            f.write("n\n")
            f.write(f"{' ' * 3}{float(aspectRatio):.5f}      {float(taperRatio):.7f}\n")
            f.write(f"{' ' * 3}{float(sweepAngle):.6f}\n")
            f.write(f"{' ' * 11}{nsect}\n")
            f.write(f"{' ' * 11}{nchange}\n")
            for sec in changeSections:
                f.write(f"{' ' * 11}{sec}\n")
            for fname in file_names:
                f.write(f"{fname}\n")
            for i in range(nsect):
                eta = float(etas[i]) if i < len(etas) else 0.0
                h = float(hsect[i]) if i < len(hsect) else 0.0
                x = float(xtwsec[i]) if i < len(xtwsec) else 0.0
                t = float(twsin[i]) if i < len(twsin) else 0.0
                f.write(f"{' ' * 2}{eta:.7f}      {h:.7f}      {x:.7f}      {t:.7f}\n")
            f.write(f"{' ' * 2}{float(body_radius):.7f}\n")
            f.write(f"{geoName}\n")
            f.write(f"{clcd_conv}\n")
            f.write(f"{' ' * 2}{float(mach):.7f}      {float(incidence):.7f}\n")

        # Copy all files from fpcon directory (excluding folders) to geoName folder
        fpcon_dir = TOOLS_FOLDER / 'fpcon'
        if os.path.exists(fpcon_dir):
            for item in os.listdir(fpcon_dir):
                src_path = os.path.join(fpcon_dir, item)
                dst_path = os.path.join(upload_dir, item)
                if os.path.isfile(src_path):
                    shutil.copy2(src_path, dst_path)

        try:
            subprocess.run(
                ['cmd.exe', '/c', 'fpcon < EXIN1.dat'],
                cwd=upload_dir,
                shell=True,
                check=True,
                timeout=10
            )
        except Exception as e:
            return jsonify({"success": False, "error": f"Error running fpcon: {str(e)}"}), 500

        # Wait for 8 seconds
        import time
        time.sleep(5)

        # Check for GEO.DAT, MAP.DAT, FLOW.DAT
        geo_dat = upload_dir / 'GEO.DAT'
        map_dat = upload_dir / 'MAP.DAT'
        flow_dat = upload_dir / 'FLOW.DAT'
        geosup_dat = upload_dir / 'GEOSUP.DAT'
        respin_dat = upload_dir / 'RESPIN.DAT'



        # Rename GEO.DAT and MAP.DAT to {geoName}.GEO and {geoName}.map
        geo_out = upload_dir / f"{geoName}.GEO"
        map_out = upload_dir / f"{geoName}.map"
        if geo_dat.exists():
            geo_dat.replace(geo_out)
        if map_dat.exists():
            map_dat.replace(map_out)


        # Prepare files for download
        files_to_send = [
            geo_out,
            map_out,
            flow_dat,
            geosup_dat,
            respin_dat
        ]
        # Check existence and collect missing files
        missing = [f for f in files_to_send if not os.path.exists(f)]
        if missing:
            return jsonify({
                "success": False,
                "error": f"Missing output files: {', '.join([os.path.basename(f) for f in missing])}"
            }), 500

        # Zip the files for download
        zip_path = upload_dir / f"{geoName}_vfp_files.zip"
        with zipfile.ZipFile(zip_path, 'w') as zipf:
            for f in files_to_send:
                zipf.write(f, arcname=os.path.basename(f))

        return send_file(
            zip_path,
            as_attachment=True,
            download_name=f"{geoName}_vfp_files.zip", 
            mimetype='application/zip'
        )

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500   

@app.route('/export-geo', methods=['POST'])
def export_geo():
    """Export modified GEO geometry file"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        geo_data = data.get('geoData')
        original_filename = data.get('filename', 'wing.GEO')
        
        if not geo_data:
            return jsonify({'error': 'No geoData provided'}), 400
        
        logger.info(f"Exporting GEO file: {original_filename}")
        logger.info(f"Number of sections: {len(geo_data)}")
        
        # Create modified filename by removing extension and adding _modified.GEO
        if original_filename.upper().endswith('.GEO'):
            base_name = original_filename[:-4]  # Remove .GEO extension
        else:
            base_name = original_filename
        
        modified_filename = f"{base_name}_modified.GEO"
        
        # Create a temporary file in temp folder
        temp_filepath = TEMP_FOLDER / f"temp_{modified_filename}"
        
        try:
            # Call the writeGEO function from readGEO module
            rG.writeGEO(str(temp_filepath), geo_data)
            
            logger.info(f"Generated modified GEO file: {modified_filename}")
            
            # Send the file to client with modified filename
            return send_file(
                str(temp_filepath), 
                as_attachment=True, 
                download_name=modified_filename,
                mimetype='application/octet-stream'
            )
            
        except Exception as e:
            logger.error(f"Error writing GEO file: {str(e)}")
            return jsonify({'error': f'Error writing GEO file: {str(e)}'}), 500
        
        finally:
            # Clean up the temporary file after sending
            try:
                if temp_filepath.exists():
                    temp_filepath.unlink()
            except Exception as cleanup_error:
                logger.warning(f"Could not clean up temp file: {cleanup_error}")
                
    except Exception as e:
        logger.error(f"Error in export_geo endpoint: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.errorhandler(404)
def not_found_error(error):
    """Handle 404 errors"""
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    """Handle 500 errors"""
    logger.error(f"Internal server error: {str(error)}")
    return jsonify({'error': 'Internal server error'}), 500

@app.errorhandler(413)
def file_too_large(error):
    """Handle file too large errors"""
    return jsonify({'error': 'File too large. Maximum size is 50MB.'}), 413

if __name__ == '__main__':
    # Determine environment and configuration
    is_production = os.environ.get('FLASK_ENV') == 'production'
    port = int(os.environ.get('PORT', 5000))
    host = '0.0.0.0'
    
    logger.info(f"🚀 Starting VFP Python Flask Application")
    logger.info(f"   Environment: {'Production' if is_production else 'Development'}")
    logger.info(f"   Host: {host}")
    logger.info(f"   Port: {port}")
    logger.info(f"   Platform: {platform.system()}")
    logger.info(f"   Python Version: {platform.python_version()}")
    
    if is_production:
        # Production configuration for Azure App Service
        socketio.run(
            app, 
            host=host, 
            port=port, 
            debug=False,
            use_reloader=False,
            log_output=True
        )
    else:
        # Development configuration
        socketio.run(
            app, 
            host=host, 
            port=port, 
            debug=True, 
            allow_unsafe_werkzeug=True,
            use_reloader=True
        )
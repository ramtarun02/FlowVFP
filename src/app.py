

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
import uuid
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
import copy
from datetime import datetime
from scipy.interpolate import griddata
import json


LOG_LEVEL = os.getenv("APP_LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("vfp-app")


# Setup Python path for module imports
current_dir = Path(__file__).parent.absolute()
project_root = current_dir.parent
sys.path.insert(0, str(current_dir))
sys.path.insert(0, str(project_root))

# Azure App Service specific configuration
def configure_for_azure():
    """Configure paths and settings for Azure App Service"""
    if os.environ.get('WEBSITE_SITE_NAME'):  # Azure App Service indicator
        home_dir = os.environ.get('HOME', '/home')
        site_root = os.environ.get('WEBSITE_SITE_ROOT', '/home/site/wwwroot')
        return {
            'is_azure': True,
            'project_root': Path(site_root),
            'data_root': Path(home_dir) / 'data',
            'temp_root': Path('/tmp')
        }
    else:
        return {
            'is_azure': False,
            'project_root': Path(__file__).parent.parent,
            'data_root': Path(__file__).parent.parent / 'data',
            'temp_root': Path(__file__).parent.parent / 'temp'
        }

azure_config = configure_for_azure()

if azure_config['is_azure']:
    logger.info("Detected Azure App Service environment")
    project_root = azure_config['project_root']
    DATA_ROOT = azure_config['data_root']
    TEMP_ROOT = azure_config['temp_root']
else:
    if os.path.exists('C:\\') and platform.system().lower() == 'windows':
        if os.path.exists('C:\\inetpub\\wwwroot'):
            project_root = Path('C:\\inetpub\\wwwroot\\VFP-Python')
        else:
            project_root = Path(__file__).parent.parent
        DATA_ROOT = project_root / 'data'
        logger.info("Detected Windows environment")
    elif os.path.exists('/app'):
        project_root = Path('/app')
        DATA_ROOT = project_root / 'data'
        logger.info("Detected Docker environment")
    elif os.environ.get('RENDER'):
        DATA_ROOT = Path('/opt/render/project/data')
        project_root = current_dir.parent
        logger.info("Detected Render environment")
    else:
        DATA_ROOT = project_root / 'data'
        logger.info("Detected development environment")

UPLOAD_FOLDER = project_root / 'data' / 'uploads'
SIMULATIONS_FOLDER = project_root / 'data' / 'Simulations'
TOOLS_FOLDER = project_root / 'tools'
LOGS_FOLDER = project_root / 'logs'
TEMP_FOLDER = project_root / 'data' / 'temp'

UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)
SIMULATIONS_FOLDER.mkdir(parents=True, exist_ok=True)
TOOLS_FOLDER.mkdir(parents=True, exist_ok=True)
LOGS_FOLDER.mkdir(parents=True, exist_ok=True)
TEMP_FOLDER.mkdir(parents=True, exist_ok=True)

logger.info("Directory structure ensured: uploads=%s simulations=%s tools=%s logs=%s temp=%s",
            UPLOAD_FOLDER, SIMULATIONS_FOLDER, TOOLS_FOLDER, LOGS_FOLDER, TEMP_FOLDER)

from flask import Flask, request, jsonify, send_file, render_template, flash, redirect, url_for
from flask_cors import CORS
from werkzeug.utils import secure_filename
from flask_socketio import emit

try:
    from src.config.socket_config import socket_config
except ImportError as e:
    logger.exception("Could not import socket_config")
    sys.exit(1)

try:
    from modules.vfp_processing import runVFP as run
    from modules.vfp_processing import readGEO as rG
    from modules.vfp_processing.readVFP import readVIS, readCP, readFORCE, readFLOW
except ImportError as e:
    logger.exception("Could not import VFP modules")
    modules_path = current_dir / 'modules'
    if modules_path.exists():
        for item in modules_path.iterdir():
            pass
    sys.exit(1)

current_process = None

app = Flask(__name__)
CORS(app, origins=['https://ramtarun02.github.io', 'http://localhost:3000'])

app.config['UPLOAD_FOLDER'] = str(UPLOAD_FOLDER)
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024 * 1024  # 6 GB
socketio = socket_config.init_app(app)

def allowed_file(filename):
    ALLOWED_EXTENSIONS = {'GEO', 'geo', 'VFP', 'vfp', 'DAT', 'dat', 'MAP', 'map', 'VIS', 'vis'}
    return '.' in filename and filename.rsplit('.', 1)[1] in ALLOWED_EXTENSIONS

def copy_files_to_folder(source_folder, destination_folder):
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


# --- Helper: Load VFP JSON ---
def load_vfp_json(vfp_path):
    with open(vfp_path, 'r', encoding='utf-8') as f:
        return json.load(f)


# --- API: Upload .vfp file ---
@app.route('/upload_vfp', methods=['POST'])
def upload_vfp():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    original_name = secure_filename(file.filename)

    # Save to a unique temp directory under uploads
    upload_id = str(uuid.uuid4())
    upload_dir = Path(app.config['UPLOAD_FOLDER']) / upload_id
    upload_dir.mkdir(parents=True, exist_ok=True)
    upload_path = upload_dir / original_name
    file.save(upload_path)

    # Debug info to help trace failures in production logs
    logger.debug("upload_vfp upload_id=%s saved_to=%s", upload_id, upload_path)

    # Run JSON splitter script against the uploaded file
    splitter_script = project_root / 'modules' / 'json-splitter.py'
    if not splitter_script.exists():
        return jsonify({'error': f'json-splitter script not found at {splitter_script}'}), 500

    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONUTF8"] = "1"
    result = subprocess.run(
        [sys.executable, str(splitter_script), str(upload_path)],
        capture_output=True,
        text=True,
        env=env,
    )

    logger.debug("splitter returncode=%s", result.returncode)
    if result.stdout:
        logger.debug("splitter stdout length=%d", len(result.stdout))
    if result.stderr:
        logger.warning("splitter stderr length=%d", len(result.stderr))

    if result.returncode != 0:
        return jsonify({
            'error': 'Failed to split JSON file',
            'details': result.stderr.strip() or result.stdout.strip()
        }), 500

    split_dir = upload_dir / 'split-json'
    main_file = split_dir / 'main.json'
    manifest_file = split_dir / 'manifest.json'

    logger.debug("upload_vfp split_dir=%s main_exists=%s manifest_exists=%s",
                 split_dir, main_file.exists(), manifest_file.exists())

    if not main_file.exists() or not manifest_file.exists():
        return jsonify({'error': 'Split output files not found'}), 500

    try:
        with open(main_file, 'r', encoding='utf-8') as f:
            main_json = json.load(f)
        with open(manifest_file, 'r', encoding='utf-8') as f:
            manifest_json = json.load(f)
    except Exception as e:
        return jsonify({'error': f'Failed to read split output: {e}'}), 500

    return jsonify({
        'uploadId': upload_id,
        'uploadedFileName': original_name,
        'main': main_json,
        'manifest': manifest_json
    })

@app.route('/get_vfp_result_files', methods=['POST'])
def get_vfp_result_files():
    try:
        data = request.get_json() or {}
    except Exception:
        logger.exception("get_vfp_result_files: invalid JSON payload")
        return jsonify({'error': 'Invalid JSON payload'}), 400

    upload_id = data.get('uploadId')
    vfp_file_name = data.get('vfpFileName')
    flow_file = data.get('flowFile')
    flow_key = data.get('flowKey')
    flow_path = data.get('flowPath')

    if not upload_id or not vfp_file_name or not flow_file:
        logger.warning(
            "get_vfp_result_files: missing required fields uploadId=%s vfpFileName=%s flowFile=%s",
            upload_id, vfp_file_name, flow_file
        )
        return jsonify({'error': 'uploadId, vfpFileName, and flowFile are required'}), 400

    upload_dir = Path(app.config['UPLOAD_FOLDER']) / upload_id
    split_dir = upload_dir / 'split-json'
    # Prefer the specific flow file under split-json; append .json if the caller omitted it
    target_name = flow_file if flow_file.lower().endswith('.json') else f"{flow_file}.json"
    vfp_path = split_dir / target_name

    if not vfp_path.exists():
        logger.error(
            "get_vfp_result_files: vfp json not found uploadId=%s path=%s",
            upload_id, vfp_path
        )
        return jsonify({'error': 'VFP file not found for provided uploadId'}), 404

    logger.debug(
        "get_vfp_result_files: reading vfp uploadId=%s file=%s flowFile=%s flowKey=%s flowPath=%s",
        upload_id, vfp_path, flow_file, flow_key, flow_path
    )

    try:
        vfp_json = load_vfp_json(vfp_path)
    except Exception:
        logger.exception("get_vfp_result_files: failed to load vfp json path=%s", vfp_path)
        return jsonify({'error': 'Failed to read VFP file'}), 500

    # The JSON now directly maps file names to content objects (no nested results/config nodes)
    files = list(vfp_json.keys())
    file_groups = {}
    for fname in files:
        ext = fname.split('.')[-1].lower()
        key = ext if ext in ['cp', 'dat', 'forces', 'geo', 'map', 'txt', 'log', 'vis', 'conv', 'sum'] else 'other'
        file_groups.setdefault(key, []).append({'name': fname})

    logger.debug(
        "get_vfp_result_files: grouped files uploadId=%s flowFile=%s counts=%s",
        upload_id, flow_file, {k: len(v) for k, v in file_groups.items()}
    )
    return jsonify(file_groups)

@app.route('/parse_vfp_file', methods=['POST'])
def parse_vfp_file():
    """
    Parse a requested result file from a VFP JSON archive.
    Expects JSON with: vfpFileName, configType, flowFile, fileType
    Returns: Parsed data as JSON (using the appropriate parser)
    """
    try:
        data = request.get_json()
        vfpFileName = data['vfpFileName']
        configType = data['configType']
        flowFile = data['flowFile']
        fileType = data['fileType'].lower()
        vfp_path = os.path.join(app.config['UPLOAD_FOLDER'], vfpFileName)
        vfp_json = load_vfp_json(vfp_path)
        results = vfp_json.get('results', {})
        config = results.get(configType, {})
        if flowFile not in config:
            return jsonify({'error': 'Flow file not found'}), 404

        # Find the first file of the requested type
        file_obj = None
        file_name = None
        for fname, content in config[flowFile].items():
            if fname.lower().endswith(f'.{fileType}'):
                file_obj = content
                file_name = fname
                break
        if not file_obj:
            return jsonify({'error': f'No .{fileType} file found'}), 404

        # Write the file to a temporary location
        temp_file_path = f"temp_{flowFile}_{file_name}"
        try:
            encoding = file_obj.get("encoding", "utf-8")
            if encoding == "utf-8":
                with open(temp_file_path, "w", encoding="utf-8") as f:
                    f.write(file_obj["data"])
            elif encoding == "base64":
                import base64
                with open(temp_file_path, "wb") as f:
                    f.write(base64.b64decode(file_obj["data"]))
            else:
                return jsonify({'error': f'Unknown encoding: {encoding}'}), 500

            # Use the appropriate parser
            if fileType == "cp":
                parsed_data = readCP(temp_file_path)
            elif fileType == "forces":
                parsed_data = readFORCE(temp_file_path)
            elif fileType == "dat":
                parsed_data = readFLOW(temp_file_path)
            else:
                # For unknown types, just return the raw content
                with open(temp_file_path, "r", encoding="utf-8", errors="ignore") as f:
                    parsed_data = {"data": f.read()}

            # Clean up temp file
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)

            if parsed_data is None:
                return jsonify({'error': f'Failed to parse {fileType} file'}), 500

            return jsonify(parsed_data), 200

        except Exception as file_error:
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)
            return jsonify({'error': f'File operation error: {str(file_error)}'}), 500

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Error parsing VFP file: {str(e)}'}), 500



@app.route('/start-vfp', methods=['POST'])
def run_vfp():
    """
    Accepts vfpData JSON, creates simulation directory and input files,
    and returns the updated vfpData with Initialisation status.
    """
    try:
        # Parse vfpData from JSON body
        vfpData = request.get_json()
        if not vfpData or "formData" not in vfpData or "inputFiles" not in vfpData:
            return jsonify({"error": "Invalid or missing vfpData structure"}), 400

        formData = vfpData["formData"]
        inputFiles = vfpData["inputFiles"]
        simName = formData.get("simName", "").strip()
        if not simName:
            vfpData["Initialisation"] = {
                "Solver Status": "VFP Case Failed",
                "Error": "Simulation name is required",
                "Warnings": None
            }
            return jsonify(vfpData), 400

        sim_folder = SIMULATIONS_FOLDER / simName
        try:
            sim_folder.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            vfpData["Initialisation"] = {
                "Solver Status": "VFP Case Failed",
                "Error": f"Could not create simulation folder: {e}",
                "Warnings": None
            }
            return jsonify(vfpData), 500

        errors = []
        warnings = []

        # Helper to write a file
        def write_file(folder, filename, content):
            try:
                file_path = folder / filename
                with open(file_path, "w", encoding="utf-8") as f:
                    f.write(content)
                return None
            except Exception as e:
                return str(e)

        # Write Wing files
        wing_cfg = inputFiles.get("wingConfig", {})
        for key, ext in [("GeoFile", ".GEO"), ("MapFile", ".MAP"), ("DatFile", ".DAT")]:
            fname = wing_cfg.get("fileNames", {}).get(key, "")
            fdata = wing_cfg.get("fileData", {}).get(fname, "")
            if fname and fdata:
                # Use extension from file name if present, else force correct ext
                out_name = Path(fname).name
                if not out_name.lower().endswith(ext.lower()):
                    out_name = Path(out_name).stem + ext
                err = write_file(sim_folder, out_name, fdata)
                if err:
                    errors.append(f"Wing {key}: {err}")
            else:
                warnings.append(f"Wing {key} missing or empty.")

        # Write Tail files
        tail_cfg = inputFiles.get("tailConfig", {})
        for key, ext in [("GeoFile", ".GEO"), ("MapFile", ".MAP"), ("DatFile", ".DAT")]:
            fname = tail_cfg.get("fileNames", {}).get(key, "")
            fdata = tail_cfg.get("fileData", {}).get(fname, "")
            if fname and fdata:
                out_name = Path(fname).name
                if not out_name.lower().endswith(ext.lower()):
                    out_name = Path(out_name).stem + ext
                err = write_file(sim_folder, out_name, fdata)
                if err:
                    errors.append(f"Tail {key}: {err}")
            elif fname:
                warnings.append(f"Tail {key} data missing for {fname}.")

        # Write Body/Spec files (optional, can be multiple)
        body_cfg = inputFiles.get("bodyFiles", {})
        body_names = body_cfg.get("fileNames", [])
        body_data = body_cfg.get("fileData", {})
        for fname in body_names:
            fdata = body_data.get(fname, "")
            if fname and fdata:
                out_name = Path(fname).name
                err = write_file(sim_folder, out_name, fdata)
                if err:
                    errors.append(f"Body file {fname}: {err}")
            elif fname:
                warnings.append(f"Body file data missing for {fname}.")

        # Compose Initialisation status
        if errors:
            vfpData["Initialisation"] = {
                "Solver Status": "VFP Case Failed",
                "Error": "; ".join(errors),
                "Warnings": "; ".join(warnings) if warnings else None
            }
            return jsonify(vfpData), 500

        vfpData["Initialisation"] = {
            "Solver Status": "VFP Case created",
            "Error": None,
            "Warnings": "; ".join(warnings) if warnings else None
        }

        logger.info("VFP case created: simName=%s", simName)
        return jsonify(vfpData), 200

    except Exception as e:
        # Catch-all error
        vfpData = {}
        vfpData["Initialisation"] = {
            "Solver Status": "VFP Case Failed",
            "Error": str(e),
            "Warnings": None
        }
        return jsonify(vfpData), 500

# REST to receive big data
@app.route('/upload_vfpdata', methods=['POST'])
def upload_vfpdata():
    data = request.get_json()
    upload_id = str(uuid.uuid4())
    save_path = os.path.join(UPLOAD_FOLDER, f"{upload_id}.json")
    with open(save_path, 'w', encoding='utf-8') as f:
        json.dump(data, f)
    return jsonify({"uploadId": upload_id})


@socketio.on('connect')
def handle_connect():
    emit('message', "WebSocket connection established")


@socketio.on('disconnect')
def handle_disconnect():
    global current_process
    if current_process:
        try:
            current_process.terminate()
            current_process = None
        except Exception:
            pass


@socketio.on('ping')
def handle_ping():
    emit('pong', {'timestamp': time.time()})


@socketio.on('start_simulation')
def start_simulation(msg):
    """Run vfp-engine with provided vfpData and stream output back to the client."""
    sid = request.sid

    def _run_simulation():
        temp_path = None
        try:
            vfp_data = msg.get('vfpData') if isinstance(msg, dict) else None

            # # Optional fallback to stored payload if an uploadId is present
            # if not vfp_data and isinstance(msg, dict) and msg.get('uploadId'):
            #     upload_id = msg.get('uploadId')
            #     stored_path = os.path.join(UPLOAD_FOLDER, f"{upload_id}.json")
            #     if os.path.exists(stored_path):
            #         with open(stored_path, 'r', encoding='utf-8') as f:
            #             vfp_data = json.load(f)

            if not vfp_data:
                socketio.emit('error', "vfpData is required to start a simulation", room=sid)
                return

            sim_name = vfp_data.get("formData", {}).get("simName", "").strip()
            if not sim_name:
                socketio.emit('error', "Simulation name is required", room=sid)
                return

            with tempfile.NamedTemporaryFile(delete=False, suffix=".vfp", mode="w", encoding="utf-8") as tf:
                json.dump(vfp_data, tf, indent=2)
                tf.flush()
                temp_path = tf.name

            vfp_engine_path = str(project_root / "modules" / "vfp-engine.py")
            env = os.environ.copy()
            env["PYTHONUNBUFFERED"] = "1"

            process = subprocess.Popen(
                [sys.executable, "-u", vfp_engine_path, temp_path],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                env=env
            )

            for line in iter(process.stdout.readline, ''):
                if line == '' and process.poll() is not None:
                    break
                if line:
                    socketio.emit('message', line.rstrip(), room=sid)

            process.stdout.close()
            return_code = process.wait()

            # Prefer a sim-specific .vfp result, fall back to first .vfp found
            sim_specific = SIMULATIONS_FOLDER / f"{sim_name}.vfp"
            result_file = sim_specific if sim_specific.exists() else None
            if not result_file:
                for file in os.listdir(SIMULATIONS_FOLDER):
                    if file.endswith('.vfp'):
                        result_file = SIMULATIONS_FOLDER / file
                        break

            if result_file and result_file.exists():
                with open(result_file, "r", encoding="utf-8") as rf:
                    result_data = json.load(rf)
                socketio.emit('simulation_finished', {'simName': sim_name}, room=sid)
            else:
                socketio.emit('error', f"Simulation finished but result file not found. Return code: {return_code}", room=sid)

        except Exception as e:
            socketio.emit('error', f"Error running simulation: {str(e)}", room=sid)
        finally:
            if temp_path and os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except Exception:
                    pass

    socketio.start_background_task(_run_simulation)


@app.route('/health')
def health_check():
    try:
        status = {
            'status': 'healthy',
            'timestamp': datetime.now().isoformat(),
            'environment': 'Azure App Service' if os.environ.get('WEBSITE_SITE_NAME') else 'Development',
            'platform': platform.platform(),
            'python_version': platform.python_version(),
            'directories': {
                'uploads_exists': UPLOAD_FOLDER.exists(),
                'simulations_exists': SIMULATIONS_FOLDER.exists(),
                'tools_exists': TOOLS_FOLDER.exists(),
                'logs_exists': LOGS_FOLDER.exists(),
                'temp_exists': TEMP_FOLDER.exists()
            }
        }
        return jsonify(status), 200
    except Exception as e:
        return jsonify({
            'status': 'unhealthy',
            'error': str(e),
            'timestamp': datetime.now().isoformat(),
            'environment': 'Azure App Service' if os.environ.get('WEBSITE_SITE_NAME') else 'Development'
        }), 500


@app.route('/test')
def test_route():
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


@socketio.on('stop_simulation')
def stop_simulation():
    global current_process
    if current_process:
        try:
            current_process.terminate()
            current_process = None
            emit('message', "Simulation stopped by user")
        except Exception as e:
            emit('error', f"Error stopping simulation: {str(e)}")
    else:
        emit('message', "No simulation currently running")

@app.route('/parse_cp', methods=['POST'])
def parse_cp():
    try:
        logger.debug("parse_cp endpoint called")
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        file = request.files['file']
        file_name = request.form.get('fileName', file.filename)
        sim_name = request.form.get('simName', 'unknown')
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        logger.debug("parse_cp processing fileName=%s simName=%s", file_name, sim_name)
        temp_file_path = f"{file_name}"
        try:
            file.save(temp_file_path)
            parsed_data = readCP(temp_file_path)
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)
            if parsed_data is None:
                return jsonify({'error': 'Failed to parse CP file - readCP returned None'}), 500
            logger.info("Successfully parsed CP file: %s", file_name)
            return jsonify(parsed_data), 200
        except Exception as file_error:
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)
            raise file_error
    except Exception as e:
        import traceback
        logger.exception("Error in parse_cp")
        return jsonify({
            'error': f'Error parsing CP file: {str(e)}',
            'traceback': traceback.format_exc()
        }), 500

@app.route('/parse_forces', methods=['POST'])
def parse_forces():
    try:
        logger.debug("parse_forces endpoint called")
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        file = request.files['file']
        file_name = request.form.get('fileName', file.filename)
        sim_name = request.form.get('simName', 'unknown')
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        logger.debug("parse_forces processing fileName=%s simName=%s", file_name, sim_name)
        temp_file_path = f"temp_{sim_name}_{file_name}"
        try:
            file.save(temp_file_path)
            parsed_data = readFORCE(temp_file_path)
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)
            if parsed_data is None:
                return jsonify({'error': 'Failed to parse Forces file - readFORCE returned None'}), 500
            logger.info("Successfully parsed Forces file: %s", file_name)
            return jsonify(parsed_data), 200
        except Exception as file_error:
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)
            raise file_error
    except Exception as e:
        import traceback
        logger.exception("Error in parse_forces")
        return jsonify({
            'error': f'Error parsing Forces file: {str(e)}',
            'traceback': traceback.format_exc()
        }), 500

@app.route('/parse_dat', methods=['POST'])
def parse_dat():
    try:
        logger.debug("parse_dat endpoint called")
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        file = request.files['file']
        file_name = request.form.get('fileName', file.filename)
        sim_name = request.form.get('simName', 'unknown')
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        logger.debug("parse_dat processing fileName=%s simName=%s", file_name, sim_name)
        temp_file_path = f"temp_{sim_name}_{file_name}"
        try:
            file.save(temp_file_path)
            parsed_data = readFLOW(temp_file_path)
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)
            if parsed_data is None:
                return jsonify({'error': 'Failed to parse DAT file - readFLOW returned None'}), 500
            logger.info("Successfully parsed DAT file: %s", file_name)
            return jsonify(parsed_data), 200
        except Exception as file_error:
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)
            raise file_error
    except Exception as e:
        import traceback
        logger.exception("Error in parse_dat")
        return jsonify({
            'error': f'Error parsing DAT file: {str(e)}',
            'traceback': traceback.format_exc()
        }), 500

@app.route('/compute_tail_downwash', methods=['POST'])
def compute_tail_downwash():
    try:
        tail_file = request.files.get('tail')
        geo_file = request.files.get('geo')
        cp_file = request.files.get('cp')
        if not tail_file or not geo_file or not cp_file:
            return jsonify({'error': 'Missing one or more required files (.tail, .GEO, .cp)'}), 400
        if not tail_file.filename or not geo_file.filename or not cp_file.filename:
            return jsonify({'error': 'One or more files have empty filename'}), 400
        import tempfile
        with tempfile.NamedTemporaryFile(delete=False) as tf_tail, \
             tempfile.NamedTemporaryFile(delete=False) as tf_geo, \
             tempfile.NamedTemporaryFile(delete=False) as tf_cp:
            tf_tail.write(tail_file.read())
            tf_geo.write(geo_file.read())
            tf_cp.write(cp_file.read())
            tf_tail.flush()
            tf_geo.flush()
            tf_cp.flush()
            try:
                from modules.vfp_processing.downwashLLT import compute_downwash_LLT
            except Exception as import_err:
                app.logger.exception("Import error in compute_tail_downwash")
                return jsonify({'error': f'Import error: {import_err}'}), 500
            try:
                results = compute_downwash_LLT(
                    tf_cp.name, tf_geo.name, tf_tail.name, save_plots=False
                )
            except Exception as compute_err:
                app.logger.exception("Computation error in compute_tail_downwash")
                return jsonify({'error': f'Computation error: {compute_err}'}), 500
        try:
            os.unlink(tf_tail.name)
            os.unlink(tf_geo.name)
            os.unlink(tf_cp.name)
        except Exception:
            pass
        # Flask/jsonify does not serialize numpy types; coerce to float for safety
        try:
            eps_val = results.get('effective_epsilon_deg')
            mach_val = results.get('avg_local_mach')
            return jsonify({
                'effective_epsilon_deg': float(eps_val) if eps_val is not None else None,
                'avg_local_mach': float(mach_val) if mach_val is not None else None
            })
        except Exception as ser_err:
            import traceback
            app.logger.exception("Serialization error in compute_tail_downwash")
            return jsonify({'error': f'Serialization error: {ser_err}'}), 500
    except Exception as e:
        import traceback
        app.logger.exception("Unhandled error in compute_tail_downwash")
        return jsonify({'error': str(e)}), 500

@app.route('/boundary_layer_data', methods=['POST'])
def boundary_layer_data():
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        if not file.filename.lower().endswith('.vis'):
            return jsonify({'error': 'Please select a .vis file'}), 400
        temp_filename = UPLOAD_FOLDER / f"temp_{secure_filename(file.filename)}"
        file.save(str(temp_filename))
        try:
            vis_data = readVIS(str(temp_filename))
            return jsonify(vis_data)
        except Exception as e:
            raise e
        finally:
            if temp_filename.exists():
                temp_filename.unlink()
    except Exception as e:
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
    xi = np.linspace(np.min(x_arr), np.max(x_arr), n_grid)
    yi = np.linspace(np.min(y_arr), np.max(y_arr), n_grid)
    xi, yi = np.meshgrid(xi, yi)
    zi = griddata((x_arr, y_arr), val_arr, (xi, yi), method='linear')
    x_grid = clean_grid(xi)
    y_grid = clean_grid(yi)
    z_grid = clean_grid(zi)
    return jsonify({"x": x_grid, "y": y_grid, "z": z_grid})

@app.route('/interpolate_parameter', methods=['POST'])
def interpolate_parameter():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        geo_data = data.get('geoData')
        plot_data = data.get('plotData')
        parameter = data.get('parameter')
        start_section = data.get('startSection')
        end_section = data.get('endSection')
        a_value = data.get('aValue', 0)
        if not geo_data:
            return jsonify({'error': 'No geoData provided'}), 400
        if parameter not in ['Twist', 'Dihedral', 'XLE']:
            return jsonify({'error': f'Invalid parameter: {parameter}'}), 400
        if start_section < 0 or end_section < 0 or start_section > end_section:
            return jsonify({'error': 'Invalid section range'}), 400
        if start_section >= len(geo_data) or end_section >= len(geo_data):
            return jsonify({'error': 'Section index out of range'}), 400
        param_key_map = {
            'Twist': 'TWIST',
            'Dihedral': 'HSECT', 
            'XLE': 'G1SECT'
        }
        geo_key = param_key_map[parameter]
        start_value = geo_data[start_section][geo_key]
        end_value = geo_data[end_section][geo_key]
        num_sections = end_section - start_section + 1
        if abs(a_value) < 1e-10:
            for i in range(num_sections):
                section_idx = start_section + i
                if num_sections == 1:
                    continue
                t = i / (num_sections - 1)
                interpolated_value = start_value + t * (end_value - start_value)
                geo_data[section_idx][geo_key] = interpolated_value
        else:
            c = start_value
            b = end_value - a_value - c
            for i in range(num_sections):
                section_idx = start_section + i
                if num_sections == 1:
                    continue
                x = i / (num_sections - 1) if num_sections > 1 else 0
                interpolated_value = a_value * x * x + b * x + c
                geo_data[section_idx][geo_key] = interpolated_value
        if parameter == 'XLE':
            for i in range(start_section, end_section + 1):
                current_chord = geo_data[i]['G2SECT'] - geo_data[i]['G1SECT']
                geo_data[i]['G2SECT'] = geo_data[i]['G1SECT'] + current_chord
        import copy
        updated_plot_data = rG.airfoils(copy.deepcopy(geo_data))
        if parameter == 'Twist':
            for section_idx in range(start_section, end_section + 1):
                current_twist = geo_data[section_idx]['TWIST']
        if parameter == 'Dihedral':
            pass
        return jsonify({
            'updatedGeoData': geo_data,
            'updatedPlotData': updated_plot_data
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@socketio.on('download')
def handle_download(data):
    """
    Send the .vfp file for the requested simulation to the client for download.
    """
    try:
        sim_name = data.get('simName')
        if not sim_name:
            emit('message', "Error: Simulation name missing.")
            return

        # Find the .vfp file in the simulation folder
        sim_folder = SIMULATIONS_FOLDER
        if not sim_folder.exists():
            emit('message', f"Error: Simulation folder '{sim_name}' not found.")
            return

        vfp_file = None
        for file in os.listdir(sim_folder):
            if file.lower().startswith(sim_name.lower()) and file.lower().endswith('.vfp'):
                vfp_file = sim_folder / file
                break

        if not vfp_file or not vfp_file.exists():
            emit('message', f"Error: No .vfp file found for simulation '{sim_name}'.")
            return

        # Read the .vfp file as binary and send to client
        with open(vfp_file, "rb") as f:
            file_data = f.read()

        emit('download_ready', {
            'simName': sim_name,
            'fileName': vfp_file.name,
            'fileData': file_data
        })

    except Exception as e:
        emit('message', f"Error during download: {str(e)}")


@socketio.on('get_simulation_folder')
def handle_get_simulation_folder(data):
    try:
        sim_name = data.get('simName')
        if not sim_name:
            emit('error', {'type': 'simulation_folder_error', 'message': 'Simulation name not provided'})
            return
        sim_folder_path = SIMULATIONS_FOLDER / sim_name
        if not sim_folder_path.exists():
            emit('error', {'type': 'simulation_folder_error', 'message': f'Simulation folder {sim_name} not found'})
            return
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
    except Exception as e:
        emit('error', {
            'type': 'simulation_folder_error',
            'message': str(e)
        })

@app.route('/get_file_content', methods=['POST'])
def get_file_content():
    try:
        data = request.get_json()
        sim_name = data.get('simName')
        file_path = data.get('filePath')
        if not sim_name or not file_path:
            return jsonify({'error': 'Missing simName or filePath'}), 400
        full_path = SIMULATIONS_FOLDER / sim_name / file_path
        abs_sim_path = (SIMULATIONS_FOLDER / sim_name).resolve()
        abs_file_path = full_path.resolve()
        if not str(abs_file_path).startswith(str(abs_sim_path)):
            return jsonify({'error': 'Invalid file path'}), 403
        if not full_path.exists():
            return jsonify({'error': 'File not found'}), 404
        with open(full_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        return content, 200, {'Content-Type': 'text/plain; charset=utf-8'}
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/import-geo', methods=['POST'])
def import_geo():
    try:
        if 'files' not in request.files:
            return jsonify({'error': 'No files uploaded'}), 400
        files = request.files.getlist('files')
        if not files or all(file.filename == '' for file in files):
            return jsonify({'error': 'No files selected'}), 400
        results = []
        for file in files:
            if file.filename == '':
                continue
            filename = secure_filename(file.filename)
            file_path = UPLOAD_FOLDER / filename
            file.save(str(file_path))
            try:
                geo_data = rG.readGEO(str(file_path))
                import copy
                points = rG.airfoils(copy.deepcopy(geo_data))
                results.append({
                    'filename': filename,
                    'geoData': geo_data,
                    'plotData': points
                })
            except Exception as e:
                results.append({
                    'filename': filename,
                    'error': f'Error processing file: {str(e)}'
                })
            finally:
                if file_path.exists():
                    file_path.unlink()
        return jsonify({'results': results}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def compute_KS0D(CL0, CD0, A):
    CL0 = np.array(CL0, dtype=float)
    CD0 = np.array(CD0, dtype=float)
    factor = 2 / (math.pi * A)
    term1 = (factor * CL0) ** 2
    term2 = (1 - factor * CD0) ** 2
    val = 1 - np.sqrt(term1 + term2)
    return np.round(val, 7)

def compute_TS0D(CL0, CD0, A):
    CL0 = np.array(CL0, dtype=float)
    CD0 = np.array(CD0, dtype=float)
    factor = 2 / (math.pi * A)
    numerator = factor * CL0
    denominator = 1 - factor * CD0
    val = np.degrees(np.arctan(numerator / denominator))
    return np.round(val, 3)

@app.route("/prowim-compute", methods=["POST"])
def compute():
    try:
        data = request.get_json()
        if data is None:
            return jsonify({"error": "Invalid or missing JSON"}), 400
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
        CL0 = np.array(data["CL0"], dtype=float)
        CD0 = np.array(data["CD0"], dtype=float)
        logger.debug("prowim compute CD0 length=%d", len(CD0))
        KS00 = np.array(data["KS00"], dtype=float)
        ALFAWI = np.array(data["ALFAWI"], dtype=float)
        KS0D = compute_KS0D(CL0, CD0, A)
        TS0D = compute_TS0D(CL0, CD0, A)
        logger.debug("Computed TS0D len=%d", len(TS0D))
        Hzp = round((1 - 2.5 * abs(ZPD)), 2)
        Kdc = round((-1.630 * cOverD ** 2 + 2.3727 * cOverD + 0.0038), 2)
        Izp = round((455.93 * ZPD ** 6 - 10.67 * ZPD**5 - 87.221 * ZPD**4 -
               3.2742 * ZPD**3 + 0.2309 * ZPD**2 + 0.0418 * ZPD + 1.0027))
        TS0Ap0_1d = -2 * Kdc * alpha0
        TS10 = Hzp * TS0Ap0_1d + 1.15 * Kdc * Izp * IW + (ALFAWI - IW)
        theta_s = TS0D + (CT + 0.3 * np.sin(np.radians(float(CT)**1.36))) * (TS10 - TS0D)
        logger.debug("Computed theta_s len=%d", len(theta_s))
        ks = KS0D + CT * (KS00 - KS0D)
        r = math.sqrt(1 - CT)
        theta_s = np.array(theta_s, dtype=float)
        ks = np.array(ks, dtype=float)
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
        CXD = (CX * NSPSW / (1 - CT))
        logger.debug("Computed CX len=%d", len(CX))
        logger.debug("Computed CXwf len=%d", len(CXwf))
        logger.debug("Computed CXDwf len=%d", len(CXDwf))
        logger.debug("Computed CXD len=%d", len(CXD))
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
        response = {"results": results}
        return jsonify(response)
    except Exception as e:
        import traceback
        logger.exception("Error in prowim-compute")
        return jsonify({"error": str(e)}), 500

@app.route('/compute_desired', methods=['POST'])
def compute_desired():
    try:
        data = request.get_json()
        section_index = data['sectionIndex']
        parameters = data['parameters']
        geo_data = data['geoData']
        plot_data = data['plotData']
        i  = section_index
        current_section = geo_data[i]
        chord = current_section['G2SECT'] - current_section['G1SECT']
        new_xle = float(parameters.get('XLE', current_section['G1SECT']))
        new_xte = float(parameters.get('XTE', current_section['G2SECT'])) 
        new_twist = float(parameters.get('Twist', current_section['TWIST']))
        new_dihedral = float(parameters.get('Dihedral', current_section['HSECT']))
        new_ysect = float(parameters.get('YSECT', current_section['YSECT']))
        new_chord = float(parameters.get('Chord', chord))
        geometry_changed = False
        if 'YSECT' in parameters and abs(new_ysect - current_section['YSECT']) > 1e-5:
            current_section['YSECT'] = new_ysect
            geometry_changed = True
        if 'XLE' in parameters and abs(new_xle - current_section['G1SECT']) > 1e-5:
            current_section['G1SECT'] = new_xle
            geometry_changed = True
        if 'XTE' in parameters and abs(new_xte - current_section['G2SECT']) > 1e-5:
            current_section['G2SECT'] = new_xte
            geometry_changed = True
        if 'Chord' in parameters and abs(new_chord - chord) > 1e-5:
            current_section['G2SECT'] = current_section['G1SECT'] + new_chord
            geometry_changed = True
        if geometry_changed:
            plot_data = rG.airfoils(geo_data)
            section_plot_data = plot_data[i]
            section_plot_data['xus_n'] = section_plot_data['xus']
            section_plot_data['zus_n'] = section_plot_data['zus']
            section_plot_data['xls_n'] = section_plot_data['xls']
            section_plot_data['zls_n'] = section_plot_data['zls']
        twist_changed = 'Twist' in parameters and abs(new_twist - current_section['TWIST']) > 1e-4
        dihedral_changed = 'Dihedral' in parameters and abs(new_dihedral - current_section['HSECT']) > 1e-4
        if twist_changed or dihedral_changed:
            section_plot_data = plot_data[i]
            if twist_changed:
                current_twist_deg = current_section['TWIST']
                dtwist_rad = (new_twist - current_twist_deg) * (math.pi / 180)
                chord = current_section['G2SECT'] - current_section['G1SECT']
                xtwsec_percent = current_section['XTWSEC']
                xtwsec_abs = current_section['G1SECT'] + xtwsec_percent * chord
                hsect = current_section['HSECT']
                xus_rotated = []
                zus_rotated = []
                for j in range(len(section_plot_data['xus'])):
                    x = section_plot_data['xus'][j]
                    z = section_plot_data['zus'][j]
                    x_shifted = x - xtwsec_abs
                    z_shifted = z - hsect
                    x_rot = x_shifted * math.cos(-dtwist_rad) - z_shifted * math.sin(-dtwist_rad)
                    z_rot = x_shifted * math.sin(-dtwist_rad) + z_shifted * math.cos(-dtwist_rad)
                    xus_rotated.append(x_rot + xtwsec_abs)
                    zus_rotated.append(z_rot+hsect)
                xls_rotated = []
                zls_rotated = []
                for j in range(len(section_plot_data['xls'])):
                    x = section_plot_data['xls'][j]
                    z = section_plot_data['zls'][j]
                    x_shifted = x - xtwsec_abs
                    z_shifted = z - hsect
                    x_rot = x_shifted * math.cos(-dtwist_rad) - z_shifted * math.sin(-dtwist_rad)
                    z_rot = x_shifted * math.sin(-dtwist_rad) + z_shifted * math.cos(-dtwist_rad)
                    xls_rotated.append(x_rot + xtwsec_abs)
                    zls_rotated.append(z_rot+hsect)
                section_plot_data['xus_n'] = xus_rotated
                section_plot_data['zus_n'] = zus_rotated
                section_plot_data['xls_n'] = xls_rotated
                section_plot_data['zls_n'] = zls_rotated
            if dihedral_changed:
                delta_z = new_dihedral - current_section['HSECT']
                section_plot_data['zus_n'] = [z + delta_z for z in section_plot_data['zus_n']]
                section_plot_data['zls_n'] = [z + delta_z for z in section_plot_data['zls_n']]
        if twist_changed:
            current_section['TWIST'] = new_twist
        if dihedral_changed:
            current_section['HSECT'] = new_dihedral
        return jsonify({
            'updatedGeoData': geo_data,
            'updatedPlotData': plot_data
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/fpcon', methods=['POST'])
def fpcon():
    try:
        geoName = request.form.get('geoName')
        aspectRatio = request.form.get('aspectRatio')
        taperRatio = request.form.get('taperRatio')
        sweepAngle = request.form.get('sweepAngle')
        nsect = int(request.form.get('nsect', 1))
        nchange = int(request.form.get('nchange', 0))
        changeSections_raw = request.form.getlist('changeSections[]') or request.form.get('changeSections', '')
        if isinstance(changeSections_raw, list) and changeSections_raw:
            changeSections = []
            for val in changeSections_raw:
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
        upload_dir = UPLOAD_FOLDER / geoName
        upload_dir.mkdir(parents=True, exist_ok=True)
        file_names = []
        for file_key in request.files:
            file = request.files[file_key]
            if file.filename:
                filename = secure_filename(file.filename)
                file.save(os.path.join(upload_dir, filename))
                file_names.append(filename)
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
        import time
        time.sleep(5)
        geo_dat = upload_dir / 'GEO.DAT'
        map_dat = upload_dir / 'MAP.DAT'
        flow_dat = upload_dir / 'FLOW.DAT'
        geosup_dat = upload_dir / 'GEOSUP.DAT'
        respin_dat = upload_dir / 'RESPIN.DAT'
        geo_out = upload_dir / f"{geoName}.GEO"
        map_out = upload_dir / f"{geoName}.map"
        if geo_dat.exists():
            geo_dat.replace(geo_out)
        if map_dat.exists():
            map_dat.replace(map_out)
        files_to_send = [
            geo_out,
            map_out,
            flow_dat,
            geosup_dat,
            respin_dat
        ]
        missing = [f for f in files_to_send if not os.path.exists(f)]
        if missing:
            return jsonify({
                "success": False,
                "error": f"Missing output files: {', '.join([os.path.basename(f) for f in missing])}"
            }), 500
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
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        geo_data = data.get('geoData')
        original_filename = data.get('filename', 'wing.GEO')
        if not geo_data:
            return jsonify({'error': 'No geoData provided'}), 400
        if original_filename.upper().endswith('.GEO'):
            base_name = original_filename[:-4]
        else:
            base_name = original_filename
        modified_filename = f"{base_name}_modified.GEO"
        temp_filepath = TEMP_FOLDER / f"temp_{modified_filename}"
        try:
            rG.writeGEO(str(temp_filepath), geo_data)
            return send_file(
                str(temp_filepath), 
                as_attachment=True, 
                download_name=modified_filename,
                mimetype='application/octet-stream'
            )
        except Exception as e:
            return jsonify({'error': f'Error writing GEO file: {str(e)}'}), 500
        finally:
            try:
                if temp_filepath.exists():
                    temp_filepath.unlink()
            except Exception as cleanup_error:
                pass
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.errorhandler(404)
def not_found_error(error):
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500

@app.errorhandler(413)
def file_too_large(error):
    return jsonify({'error': 'File too large. Maximum size is 50MB.'}), 413

if __name__ == '__main__':
    is_production = os.environ.get('FLASK_ENV') == 'production'
    port = int(os.environ.get('PORT', 5000))
    host = '0.0.0.0'
    if is_production:
        socketio.run(
            app, 
            host=host, 
            port=port, 
            debug=False,
            use_reloader=False,
            log_output=True
        )
    else:
        socketio.run(
            app, 
            host=host, 
            port=port, 
            debug=True, 
            allow_unsafe_werkzeug=True,
            use_reloader=True
        )
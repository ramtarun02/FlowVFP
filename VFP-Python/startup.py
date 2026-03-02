#!/usr/bin/env python3
"""
Azure App Service startup script for VFP Python Flask Application
Handles socket configuration imports and proper Azure environment setup
"""
import os
import sys
import logging
from pathlib import Path

def setup_azure_environment():
    """Setup environment variables and paths for Azure App Service"""
    # Set default environment variables
    os.environ.setdefault('FLASK_ENV', 'production')
    os.environ.setdefault('PYTHONUNBUFFERED', '1')
    os.environ.setdefault('PYTHONDONTWRITEBYTECODE', '1')
    
    # Detect Azure App Service environment
    if os.environ.get('WEBSITE_SITE_NAME'):
        # Running on Azure App Service
        site_root = os.environ.get('WEBSITE_SITE_ROOT', 'D:\\home\\site\\wwwroot')
        home_dir = os.environ.get('HOME', 'D:\\home')
        
        # Azure App Service Python paths
        python_paths = [
            site_root,
            os.path.join(site_root, 'src'),
            os.path.join(site_root, 'src', 'config'),
            os.path.join(site_root, 'modules'),
            os.path.join(site_root, 'config')
        ]
        
        # Update PYTHONPATH
        current_pythonpath = os.environ.get('PYTHONPATH', '')
        new_pythonpath = ';'.join(python_paths)  # Windows uses semicolon
        
        if current_pythonpath:
            os.environ['PYTHONPATH'] = f"{new_pythonpath};{current_pythonpath}"
        else:
            os.environ['PYTHONPATH'] = new_pythonpath
            
        return {
            'is_azure': True,
            'site_root': Path(site_root),
            'home_dir': Path(home_dir),
            'python_executable': 'D:\\home\\Python\\python.exe'
        }
    else:
        # Local development
        app_dir = Path(__file__).parent
        python_paths = [
            str(app_dir),
            str(app_dir / 'src'),
            str(app_dir / 'src' / 'config'),
            str(app_dir / 'modules'),
            str(app_dir / 'config')
        ]
        
        os.environ['PYTHONPATH'] = ';'.join(python_paths)
        
        return {
            'is_azure': False,
            'site_root': app_dir,
            'home_dir': app_dir,
            'python_executable': sys.executable
        }

def setup_logging(config):
    """Setup logging for Azure environment"""
    try:
        log_level = logging.INFO
        log_format = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        
        if config['is_azure']:
            # Azure App Service - log to stdout for capture by Azure logging
            logging.basicConfig(
                level=log_level,
                format=log_format,
                handlers=[
                    logging.StreamHandler(sys.stdout),
                    logging.StreamHandler(sys.stderr)
                ]
            )
        else:
            # Local development
            logging.basicConfig(level=log_level, format=log_format)
            
        return logging.getLogger(__name__)
        
    except Exception as e:
        print(f"Warning: Could not setup logging: {e}")
        return logging.getLogger(__name__)

def add_paths_to_sys(config):
    """Add necessary paths to sys.path for module imports"""
    paths_to_add = [
        str(config['site_root']),
        str(config['site_root'] / 'src'),
        str(config['site_root'] / 'src' / 'config'),
        str(config['site_root'] / 'modules'),
        str(config['site_root'] / 'config')
    ]
    
    for path in paths_to_add:
        if path not in sys.path:
            sys.path.insert(0, path)

def validate_socket_config():
    """Socket.IO is now configured inside the application factory; nothing to validate separately."""
    return True, None

def validate_flask_app():
    """Validate that the main Flask app is importable via the application factory"""
    try:
        from src.factory import create_app
        from src.extensions import socketio
        app = create_app()
        return True, (app, socketio)
    except ImportError as e:
        return False, f"Could not import Flask app: {e}"
    except Exception as e:
        return False, f"Error importing Flask app: {e}"

def main():
    """Main startup function"""
    print("🚀 Starting VFP Python Flask Application on Azure App Service")
    
    # Setup Azure environment
    config = setup_azure_environment()
    logger = setup_logging(config)
    
    logger.info("Azure App Service startup script initialized")
    logger.info(f"Environment: {'Azure App Service' if config['is_azure'] else 'Local Development'}")
    logger.info(f"Site root: {config['site_root']}")
    logger.info(f"Python executable: {config['python_executable']}")
    
    # Add paths to sys.path
    add_paths_to_sys(config)
    logger.info(f"Python path configured with {len(sys.path)} entries")
    logger.info(f"First 3 paths: {sys.path[:3]}")
    
    # Print environment info for debugging
    if config['is_azure']:
        logger.info("Azure Environment Variables:")
        azure_vars = ['WEBSITE_SITE_NAME', 'WEBSITE_SITE_ROOT', 'HOME', 'PORT', 'HTTP_PLATFORM_PORT']
        for var in azure_vars:
            value = os.environ.get(var, 'Not Set')
            logger.info(f"  {var}: {value}")
    
    # Validate socket configuration (now always passes – configured in factory)
    socket_valid, _ = validate_socket_config()
    logger.info("✓ Socket configuration validated successfully")
    
    # Validate Flask application
    app_valid, app_result = validate_flask_app()
    if not app_valid:
        logger.error(f"Flask application validation failed: {app_result}")
        print(f"❌ Error: {app_result}")
        
        # List available files in src directory
        try:
            src_dir = config['site_root'] / 'src'
            if src_dir.exists():
                files = list(src_dir.iterdir())
                logger.info(f"Files in src/: {[f.name for f in files]}")
        except Exception as debug_error:
            logger.error(f"Could not list src directory: {debug_error}")
        
        sys.exit(1)
    
    # Import the Flask application components
    try:
        app, socketio = app_result
        logger.info("✓ Flask application imported successfully")
        
        # Get port from Azure environment
        port = int(os.environ.get('PORT', os.environ.get('HTTP_PLATFORM_PORT', 8000)))
        host = '0.0.0.0'
        
        logger.info(f"Starting application configuration:")
        logger.info(f"  Host: {host}")
        logger.info(f"  Port: {port}")
        logger.info(f"  Socket.IO: Enabled")
        logger.info(f"  Environment: {os.environ.get('FLASK_ENV', 'production')}")
        logger.info(f"  Debug Mode: False")
        
        print(f"   Host: {host}")
        print(f"   Port: {port}")
        print(f"   Socket.IO: Enabled")
        print(f"   Environment: {os.environ.get('FLASK_ENV', 'production')}")
        print(f"   Native Windows Support: Yes")
        
        # Start the application with SocketIO
        socketio.run(
            app,
            host=host,
            port=port,
            debug=False,
            use_reloader=False,
            log_output=True,
            allow_unsafe_werkzeug=True
        )
        
    except Exception as e:
        logger.error(f"Failed to start application: {e}")
        print(f"❌ Startup Error: {e}")
        
        # Additional debugging information
        print(f"Current working directory: {os.getcwd()}")
        print(f"Python version: {sys.version}")
        print(f"Python path: {sys.path[:5]}...")  # Show first 5 paths
        
        import traceback
        traceback.print_exc()
        
        sys.exit(1)

if __name__ == '__main__':
    main()

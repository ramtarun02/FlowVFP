"""
Flask-SocketIO Configuration
Handles WebSocket connections and events for VFP processing
"""

from flask_socketio import SocketIO, emit
import time
import platform
import logging

# Configure logging
logger = logging.getLogger(__name__)

class SocketConfig:
    """SocketIO configuration and event handlers"""
    
    def __init__(self, app=None):
        self.socketio = None
        self.current_process = None
        
        if app:
            self.init_app(app)
    
    def init_app(self, app):
        """Initialize SocketIO with the Flask app"""
        self.socketio = SocketIO(
            app,
            manage_session=True,
            cors_allowed_origins={'https://ramtarun02.github.io', 'http://localhost:3000'},
            ping_timeout=300,  # 5 minutes
            ping_interval=25,  # 25 seconds
            logger=True,
            engineio_logger=True
        )
        
        # Register event handlers
        self._register_handlers()
        
        return self.socketio
    
    def _register_handlers(self):
        """Register all SocketIO event handlers"""
        
        @self.socketio.on('connect')
        def handle_connect():
            logger.info("Client connected")
            emit('message', "WebSocket connection established")
        
        @self.socketio.on('disconnect')
        def handle_disconnect():
            logger.info("Client disconnected")
            # Kill any running process if client disconnects
            if self.current_process:
                try:
                    self.current_process.terminate()
                    self.current_process = None
                    logger.info("Terminated running process due to client disconnect")
                except Exception as e:
                    logger.error(f"Error terminating process: {e}")
        
        @self.socketio.on('ping')
        def handle_ping():
            """Handle client ping to keep connection alive"""
            emit('pong', {'timestamp': time.time()})
        
        @self.socketio.on('stop_simulation')
        def stop_simulation():
            """Allow client to stop running simulation"""
            if self.current_process:
                try:
                    self.current_process.terminate()
                    self.current_process = None
                    emit('message', "Simulation stopped by user")
                except Exception as e:
                    emit('error', f"Error stopping simulation: {str(e)}")
            else:
                emit('message', "No simulation currently running")
    
    def set_current_process(self, process):
        """Set the current running process"""
        self.current_process = process
    
    def get_current_process(self):
        """Get the current running process"""
        return self.current_process
    
    def emit_message(self, message):
        """Emit a message to connected clients"""
        if self.socketio:
            self.socketio.emit('message', message)
    
    def emit_error(self, error_message):
        """Emit an error to connected clients"""
        if self.socketio:
            self.socketio.emit('error', error_message)
    
    def emit_heartbeat(self, status_data):
        """Emit a heartbeat to connected clients"""
        if self.socketio:
            self.socketio.emit('heartbeat', status_data)

# Global instance
socket_config = SocketConfig()
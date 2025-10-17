"""
WSGI entry point for Azure App Service
Gunicorn looks for this file automatically
"""
import os
import sys
from pathlib import Path

# Add paths
current_dir = Path(__file__).parent
sys.path.insert(0, str(current_dir))
sys.path.insert(0, str(current_dir / 'src'))

# Import your Flask app
from src.app import app

# Gunicorn will use this
application = app

if __name__ == "__main__":
    app.run()

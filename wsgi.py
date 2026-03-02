"""
WSGI Entry Point
================
Compatible with Gunicorn, uWSGI, Azure App Service (via web.config) and
any other WSGI server.

    gunicorn "wsgi:application" --worker-class eventlet -w 1 --bind 0.0.0.0:8000
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# ── Ensure the project root is importable ────────────────────────────────────
_root = Path(__file__).parent
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))

# Load .env when running locally (python-dotenv is optional)
try:
    from dotenv import load_dotenv
    load_dotenv(_root / ".env")
except ImportError:
    pass

from src.factory import create_app          # noqa: E402
from src.extensions import socketio         # noqa: E402

# Create the application
app = create_app()

# Standard WSGI callable used by Gunicorn / uWSGI
application = app

if __name__ == "__main__":
    # Development convenience: ``python wsgi.py``
    port  = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_ENV", "development") != "production"
    socketio.run(
        app,
        host="0.0.0.0",
        port=port,
        debug=debug,
        allow_unsafe_werkzeug=debug,
        # Flask-SocketIO REQUIRES use_reloader=False.
        # The Werkzeug reloader forks two processes; the HTTP polling handshake
        # lands on one process (assigning a SID) and the WebSocket upgrade
        # request hits the other, which has no record of that SID →
        # "Session is disconnected" / 400 BAD REQUEST.
        use_reloader=False,
    )

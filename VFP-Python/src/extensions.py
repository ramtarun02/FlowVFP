"""
Flask Extension Singletons
==========================
Create extension instances here (no app bound yet).
Call ``init_app(app)`` inside the application factory.
"""
from __future__ import annotations

import logging
import os

from flask_cors import CORS
from flask_socketio import SocketIO
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

logger = logging.getLogger(__name__)

# ── SocketIO ──────────────────────────────────────────────────────────────────
socketio = SocketIO()

# ── Rate Limiter ──────────────────────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address)


def init_extensions(app) -> None:
    """Bind all extensions to the Flask *app* instance."""
    from .config import get_config
    cfg = get_config()
    packaged_mode = app.config.get("PACKAGED_MODE") or os.environ.get("FLOWVFP_PACKAGED", "0").lower() in {"1", "true", "yes"}
    origins = "*" if packaged_mode else cfg.CORS_ORIGINS

    # ── CORS ──────────────────────────────────────────────────────────────────
    CORS(
        app,
        resources={
            r"/socket.io/*": {"origins": origins},
            r"/api/*":        {"origins": origins},
            r"/health":       {"origins": "*"},
        },
        supports_credentials=False,
    )

    # ── SocketIO ──────────────────────────────────────────────────────────────
    # In debug/dev mode allow any origin so the Vite dev server is never
    # blocked if it picks an unexpected port (3001, 3002 …).  Credentials
    # are not used so "*" is safe here.
    _sio_origins = "*" if (app.debug or packaged_mode) else cfg.CORS_ORIGINS
    _reduce_engineio_noise(app)
    socketio.init_app(
        app,
        async_mode=cfg.SOCKETIO_ASYNC_MODE,
        manage_session=False,          # let Flask-Login / JWT own sessions
        cors_allowed_origins=_sio_origins,
        ping_timeout=cfg.SOCKETIO_PING_TIMEOUT,
        ping_interval=cfg.SOCKETIO_PING_INTERVAL,
        # Raise the engine.io HTTP polling payload cap so that continuation-run
        # payloads embedding fort dump file contents (can be tens of MB) are
        # not silently discarded.  Default is 1 MB which is far too small.
        max_http_buffer_size=cfg.SOCKETIO_MAX_HTTP_BUFFER_SIZE,
        logger=logging.getLogger("socketio"),
        engineio_logger=logging.getLogger("engineio"),
    )

    # ── Rate Limiter ──────────────────────────────────────────────────────────
    limiter.init_app(app)


def _reduce_engineio_noise(app) -> None:
    """Lower Engine.IO / Socket.IO log verbosity to avoid huge payload dumps."""
    for name in ("engineio", "socketio"):
        lvl_key = f"{name.upper()}_LOG_LEVEL"
        level_name = app.config.get(lvl_key, "WARNING")
        level = logging.getLevelName(level_name)
        logging.getLogger(name).setLevel(level)

"""
Application Factory
===================
Usage::

    from src.factory import create_app
    app = create_app()

or via the ``flask`` CLI with ``FLASK_APP=src.factory:create_app``.
"""
from __future__ import annotations

import logging
import sys
from pathlib import Path

from flask import Flask

from .config import BaseConfig, get_config
from .extensions import init_extensions, socketio


def create_app(config_override: type[BaseConfig] | None = None) -> Flask:
    """Create and configure the Flask application.

    Parameters
    ----------
    config_override:
        Pass a config class to override the environment-determined one.
        Useful in tests.
    """
    app = Flask(__name__)

    # ── Configuration ─────────────────────────────────────────────────────────
    cfg = config_override or get_config()
    app.config.from_object(cfg)

    # ── Logging ───────────────────────────────────────────────────────────────
    _configure_logging(app)
    logger = logging.getLogger("vfp.factory")
    logger.info("Starting FlowVFP with config=%s", cfg.__name__)

    # ── Directory scaffold ────────────────────────────────────────────────────
    _ensure_directories(app)

    # ── Python path (modules/) ────────────────────────────────────────────────
    _patch_python_path(app)

    # ── Extensions ────────────────────────────────────────────────────────────
    init_extensions(app)

    # ── Blueprints ────────────────────────────────────────────────────────────
    _register_blueprints(app)

    # ── Socket.IO handlers ────────────────────────────────────────────────────
    _register_socket_handlers()

    # ── Global error handlers ─────────────────────────────────────────────────
    _register_error_handlers(app)

    return app


# ── Helpers ───────────────────────────────────────────────────────────────────

def _configure_logging(app: Flask) -> None:
    level = getattr(logging, app.config.get("APP_LOG_LEVEL", "INFO"), logging.INFO)
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)-8s [%(name)s] %(message)s",
        handlers=[logging.StreamHandler(sys.stdout)],
        force=True,
    )
    # Silence noisy libraries
    for noisy in ("werkzeug",):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def _ensure_directories(app: Flask) -> None:
    """Create runtime directories if they do not exist."""
    for key in ("UPLOAD_FOLDER", "SIMULATIONS_FOLDER", "TEMP_FOLDER", "LOGS_FOLDER"):
        path: Path = app.config[key]
        path.mkdir(parents=True, exist_ok=True)


def _patch_python_path(app: Flask) -> None:
    """Add the project root and modules/ to sys.path so VFP modules are importable."""
    project_root: Path = app.config["PROJECT_ROOT"]
    candidates = [
        project_root,
        project_root / "modules",
        project_root / "src",
    ]
    for p in candidates:
        s = str(p)
        if s not in sys.path and p.exists():
            sys.path.insert(0, s)


def _register_blueprints(app: Flask) -> None:
    from .api.health      import health_bp
    from .api.geometry    import geometry_bp
    from .api.simulation  import simulation_bp
    from .api.files       import files_bp
    from .api.postprocessing import postprocessing_bp
    from .api.prowim      import prowim_bp

    app.register_blueprint(health_bp)
    app.register_blueprint(geometry_bp,      url_prefix="/api/geometry")
    app.register_blueprint(simulation_bp,    url_prefix="/api/simulation")
    app.register_blueprint(files_bp,         url_prefix="/api/files")
    app.register_blueprint(postprocessing_bp, url_prefix="/api/post")
    app.register_blueprint(prowim_bp,        url_prefix="/api/prowim")


def _register_socket_handlers() -> None:
    from .sockets import simulation as _sim_socket  # noqa: F401  (registers handlers)


def _register_error_handlers(app: Flask) -> None:
    from flask import jsonify

    @app.errorhandler(400)
    def bad_request(e):
        return jsonify(error="Bad request", detail=str(e)), 400

    @app.errorhandler(403)
    def forbidden(e):
        return jsonify(error="Forbidden"), 403

    @app.errorhandler(404)
    def not_found(e):
        return jsonify(error="Not found"), 404

    @app.errorhandler(413)
    def request_entity_too_large(e):
        max_mb = app.config.get("MAX_UPLOAD_MB", 100)
        return jsonify(error=f"File too large. Maximum upload size is {max_mb} MB."), 413

    @app.errorhandler(429)
    def ratelimit_handler(e):
        return jsonify(error="Rate limit exceeded", retry_after=e.description), 429

    @app.errorhandler(500)
    def internal_server_error(e):
        # Never leak tracebacks to the client
        logging.getLogger("vfp.errors").exception("Unhandled exception")
        return jsonify(error="Internal server error"), 500

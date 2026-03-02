"""
Application Configuration
=========================
Environment-specific settings loaded from environment variables.
Never commit secrets; use a .env file locally and App Service Application Settings in Azure.
"""
from __future__ import annotations

import os
from pathlib import Path
import platform


def _resolve_paths() -> dict[str, Path]:
    """Resolve filesystem paths based on the runtime environment."""
    site_name = os.environ.get("WEBSITE_SITE_NAME")      # Azure App Service
    render     = os.environ.get("RENDER")                 # Render.com
    docker     = os.path.exists("/app")                   # Docker

    if site_name:
        site_root = Path(os.environ.get("WEBSITE_SITE_ROOT", "/home/site/wwwroot"))
        home_dir  = Path(os.environ.get("HOME", "/home"))
        return {
            "project_root": site_root,
            "data_root":    home_dir / "data",
            "temp_root":    Path("/tmp"),
        }

    if render:
        project_root = Path(__file__).parent.parent
        return {
            "project_root": project_root,
            "data_root":    Path("/opt/render/project/data"),
            "temp_root":    Path("/tmp"),
        }

    if docker:
        project_root = Path("/app")
        return {
            "project_root": project_root,
            "data_root":    project_root / "data",
            "temp_root":    project_root / "tmp",
        }

    # Local / Windows IIS
    project_root = Path(__file__).parent.parent
    if platform.system().lower() == "windows" and Path("C:\\inetpub\\wwwroot").exists():
        project_root = Path("C:\\inetpub\\wwwroot\\VFP-Python")

    return {
        "project_root": project_root,
        "data_root":    project_root / "data",
        "temp_root":    project_root / "data" / "temp",
    }


_paths = _resolve_paths()

# Eventlet does NOT properly monkey-patch Windows named-pipe/subprocess I/O,
# so default to threading mode on Windows to prevent the event loop from
# blocking while the VFP solver subprocess runs.
# On Linux (Azure / Render) eventlet integrates cleanly with gunicorn workers.
_DEFAULT_ASYNC_MODE = "threading" if platform.system().lower() == "windows" else "eventlet"


class BaseConfig:
    """Shared settings across all environments."""

    # ── Security ──────────────────────────────────────────────────────────────
    SECRET_KEY: str = os.environ.get("SECRET_KEY", "change-me-in-production")

    # ── File Upload ───────────────────────────────────────────────────────────
    # 100 MB hard limit — large .vfp archives should be streamed, not buffered
    MAX_CONTENT_LENGTH: int = int(os.environ.get("MAX_UPLOAD_MB", "100")) * 1024 * 1024
    ALLOWED_EXTENSIONS: frozenset[str] = frozenset(
        {"geo", "vfp", "dat", "map", "vis", "tail"}
    )

    # ── Paths ─────────────────────────────────────────────────────────────────
    PROJECT_ROOT:      Path = _paths["project_root"]
    DATA_ROOT:         Path = _paths["data_root"]
    UPLOAD_FOLDER:     Path = _paths["data_root"] / "uploads"
    SIMULATIONS_FOLDER: Path = _paths["data_root"] / "Simulations"
    TOOLS_FOLDER:      Path = PROJECT_ROOT / "tools"
    LOGS_FOLDER:       Path = PROJECT_ROOT / "logs"
    TEMP_FOLDER:       Path = _paths["temp_root"]

    # ── CORS ──────────────────────────────────────────────────────────────────
    # Include common Vite dev-server ports (Vite increments when the default
    # port is busy: 3000 → 3001 → 3002 …).  Production origins are controlled
    # via the CORS_ORIGINS environment variable.
    CORS_ORIGINS: list[str] = os.environ.get(
        "CORS_ORIGINS",
        (
            "https://ramtarun02.github.io"
            ",http://localhost:3000,http://127.0.0.1:3000"
            ",http://localhost:3001,http://127.0.0.1:3001"
            ",http://localhost:3002,http://127.0.0.1:3002"
            ",http://localhost:5173,http://127.0.0.1:5173"
        ),
    ).split(",")

    # ── SocketIO ──────────────────────────────────────────────────────────────
    SOCKETIO_ASYNC_MODE:    str = os.environ.get("SOCKETIO_ASYNC_MODE", _DEFAULT_ASYNC_MODE)
    SOCKETIO_PING_TIMEOUT:  int = int(os.environ.get("SOCKETIO_PING_TIMEOUT",  "300"))
    SOCKETIO_PING_INTERVAL: int = int(os.environ.get("SOCKETIO_PING_INTERVAL", "25"))
    # Allow payloads up to 100 MB so that continuation-run fort dump files
    # (which are embedded in the start_simulation socket event) are not
    # silently rejected by engine.io's default 1 MB buffer limit.
    SOCKETIO_MAX_HTTP_BUFFER_SIZE: int = int(
        os.environ.get("SOCKETIO_MAX_HTTP_BUFFER_SIZE_MB", "100")
    ) * 1024 * 1024
    ENGINEIO_LOG_LEVEL:  str = os.environ.get("ENGINEIO_LOG_LEVEL",  "WARNING")
    SOCKETIO_LOG_LEVEL:  str = os.environ.get("SOCKETIO_LOG_LEVEL",  "WARNING")

    # ── Rate Limiting ─────────────────────────────────────────────────────────
    RATELIMIT_DEFAULT:        str = os.environ.get("RATELIMIT_DEFAULT",        "200 per hour")
    RATELIMIT_STORAGE_URL:    str = os.environ.get("RATELIMIT_STORAGE_URL",    "memory://")
    RATELIMIT_STRATEGY:       str = os.environ.get("RATELIMIT_STRATEGY",       "fixed-window")
    RATELIMIT_HEADERS_ENABLED: bool = True

    # ── Logging ───────────────────────────────────────────────────────────────
    APP_LOG_LEVEL: str = os.environ.get("APP_LOG_LEVEL", "INFO").upper()


class DevelopmentConfig(BaseConfig):
    DEBUG = True
    TESTING = False
    APP_LOG_LEVEL = "DEBUG"


class ProductionConfig(BaseConfig):
    DEBUG = False
    TESTING = False

    # Enforce a real SECRET_KEY in production
    @classmethod
    def validate(cls) -> None:
        if cls.SECRET_KEY == "change-me-in-production":
            raise ValueError(
                "SECRET_KEY must be set to a cryptographically random value in production. "
                "Set the SECRET_KEY environment variable."
            )


class TestingConfig(BaseConfig):
    TESTING = True
    DEBUG   = True
    # Use an in-memory filesystem-style path for tests
    UPLOAD_FOLDER      = Path("/tmp/vfp_test/uploads")
    SIMULATIONS_FOLDER = Path("/tmp/vfp_test/simulations")
    TEMP_FOLDER        = Path("/tmp/vfp_test/temp")
    MAX_CONTENT_LENGTH = 50 * 1024 * 1024  # 50 MB for tests


_CONFIG_MAP: dict[str, type[BaseConfig]] = {
    "development": DevelopmentConfig,
    "production":  ProductionConfig,
    "testing":     TestingConfig,
}


def get_config() -> type[BaseConfig]:
    """Return the appropriate config class based on FLASK_ENV."""
    env = os.environ.get("FLASK_ENV", "development").lower()
    cfg = _CONFIG_MAP.get(env, DevelopmentConfig)
    if hasattr(cfg, "validate"):
        cfg.validate()  # type: ignore[attr-defined]
    return cfg

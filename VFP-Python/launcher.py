from __future__ import annotations

import json
import os
import runpy
import secrets
import socket
import sys
import threading
import webbrowser
from pathlib import Path
from typing import Any

from flask import abort, send_from_directory


def _default_runtime_home() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


RUNTIME_HOME = Path(
    os.environ.get(
        "FLOWVFP_RUNTIME_HOME",
        str(_default_runtime_home()),
    )
)
CONFIG_PATH = RUNTIME_HOME / "runtime-config.json"

DEFAULT_CONFIG: dict[str, Any] = {
    "host": "0.0.0.0",
    "port": 5000,
    "open_browser": True,
    "secret_key": "",
}


def _ensure_runtime_config() -> dict[str, Any]:
    RUNTIME_HOME.mkdir(parents=True, exist_ok=True)

    if not CONFIG_PATH.exists():
        created = DEFAULT_CONFIG.copy()
        created["secret_key"] = secrets.token_hex(32)
        CONFIG_PATH.write_text(json.dumps(created, indent=2), encoding="utf-8")
        return created

    try:
        loaded = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        loaded = {}

    cfg = DEFAULT_CONFIG.copy()
    cfg.update({k: v for k, v in loaded.items() if k in cfg})

    if not isinstance(cfg["host"], str) or not cfg["host"].strip():
        cfg["host"] = DEFAULT_CONFIG["host"]
    if not isinstance(cfg["port"], int):
        cfg["port"] = DEFAULT_CONFIG["port"]
    if not isinstance(cfg["open_browser"], bool):
        cfg["open_browser"] = DEFAULT_CONFIG["open_browser"]
    if not isinstance(cfg["secret_key"], str) or not cfg["secret_key"].strip():
        cfg["secret_key"] = secrets.token_hex(32)

    CONFIG_PATH.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
    return cfg


def _resolve_project_root() -> Path:
    if getattr(sys, "frozen", False):
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            return Path(meipass).resolve()
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def _resolve_frontend_build_dir(project_root: Path) -> Path:
    explicit = os.environ.get("FRONTEND_BUILD_DIR")
    if explicit:
        candidate = Path(explicit)
        if candidate.exists():
            return candidate

    if not getattr(sys, "frozen", False):
        # During source development, prefer the frontend app build output.
        dev_dir = project_root.parent / "VFP-2025" / "build"
        if dev_dir.exists():
            return dev_dir

    packaged_dir = project_root / "frontend_build"
    if packaged_dir.exists():
        return packaged_dir

    return project_root.parent / "VFP-2025" / "build"


def _prepare_environment(project_root: Path, secret_key: str) -> None:
    data_root = RUNTIME_HOME / "data"
    logs_root = RUNTIME_HOME / "logs"
    temp_root = RUNTIME_HOME / "temp"

    for p in (data_root, logs_root, temp_root):
        p.mkdir(parents=True, exist_ok=True)

    os.environ.setdefault("FLASK_ENV", "production")
    os.environ.setdefault("SECRET_KEY", secret_key)
    os.environ.setdefault("FLOWVFP_PACKAGED", "1")
    os.environ.setdefault("CORS_ORIGINS", "*")
    os.environ.setdefault("PROJECT_ROOT_DIR", str(project_root))
    os.environ.setdefault("DATA_DIR", str(data_root))
    os.environ.setdefault("LOGS_DIR", str(logs_root))
    os.environ.setdefault("TEMP_DIR", str(temp_root))


def _register_spa_routes(app, frontend_dir: Path) -> None:
    reserved_exact = {"api", "health", "ping"}
    reserved_prefixes = ("api/", "socket.io")

    @app.get("/")
    def serve_index():
        return send_from_directory(frontend_dir, "index.html")

    @app.get("/<path:path>")
    def serve_frontend(path: str):
        if path in reserved_exact or path.startswith(reserved_prefixes):
            abort(404)

        candidate = frontend_dir / path
        if candidate.exists() and candidate.is_file():
            return send_from_directory(frontend_dir, path)

        return send_from_directory(frontend_dir, "index.html")


def _resolve_display_host(bind_host: str) -> str:
    if bind_host not in {"0.0.0.0", "::"}:
        return bind_host
    try:
        return socket.gethostbyname(socket.gethostname())
    except OSError:
        return "127.0.0.1"


def _run_engine_entry(vfp_payload_path: str) -> int:
    project_root = _resolve_project_root()
    modules_dir = project_root / "modules"
    engine_script = modules_dir / "vfp-engine.py"

    if not engine_script.exists():
        print(f"Engine script not found: {engine_script}", file=sys.stderr)
        return 2

    # Ensure vfp_engine dependencies under modules/ are importable.
    sys.path.insert(0, str(modules_dir))
    original_argv = sys.argv[:]
    try:
        sys.argv = [str(engine_script), vfp_payload_path]
        runpy.run_path(str(engine_script), run_name="__main__")
        return 0
    except SystemExit as exc:
        code = exc.code if isinstance(exc.code, int) else 1
        return code
    finally:
        sys.argv = original_argv


def main() -> None:
    if len(sys.argv) >= 3 and sys.argv[1] == "--run-vfp-engine":
        raise SystemExit(_run_engine_entry(sys.argv[2]))

    cfg = _ensure_runtime_config()

    project_root = _resolve_project_root()
    _prepare_environment(project_root, cfg["secret_key"])

    from src.factory import create_app
    from src.extensions import socketio

    frontend_dir = _resolve_frontend_build_dir(project_root)
    if not frontend_dir.exists():
        raise FileNotFoundError(
            "Frontend build directory not found. Expected frontend_build next to launcher, "
            "or set FRONTEND_BUILD_DIR."
        )

    app = create_app()
    _register_spa_routes(app, frontend_dir)

    host = cfg["host"]
    port = int(cfg["port"])
    display_host = _resolve_display_host(host)
    launch_url = f"http://{display_host}:{port}"

    print(f"FlowVFP running at {launch_url}")
    print(f"Runtime config: {CONFIG_PATH}")

    if cfg.get("open_browser", True):
        threading.Timer(1.0, lambda: webbrowser.open(launch_url)).start()

    socketio.run(
        app,
        host=host,
        port=port,
        debug=False,
        allow_unsafe_werkzeug=False,
        use_reloader=False,
    )


if __name__ == "__main__":
    main()

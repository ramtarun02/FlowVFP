"""
Socket.IO Simulation Handlers
==============================
Real-time communication for VFP solver execution.  Each client-side event
receives output lines streamed line-by-line via the ``message`` event.

Events received from client:
    connect             — standard Socket.IO connect
    disconnect          — standard Socket.IO disconnect
    ping                — keepalive
    start_simulation    — begin a VFP run; expects ``{ vfpData: {...} }``
    stop_simulation     — kill the currently running simulation
    download            — request the ``.vfp`` result archive for download
    get_simulation_folder — request the file listing of a simulation folder

Events emitted to client:
    message             — plain text log lines
    error               — error description
    pong                — response to *ping*
    simulation_finished — ``{ simName }`` on successful solver exit
    download_ready      — ``{ simName, fileName, fileData }``
    simulation_folder_ready — full file listing
"""
from __future__ import annotations

import json
import logging
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Optional

from flask import current_app, request
from flask_socketio import emit

from ..extensions import socketio

logger = logging.getLogger("vfp.sockets.simulation")

# ── Module-level state (one active process per server worker) ─────────────────
# NOTE: for multi-worker deployments use a shared state store (Redis / DB).
_current_process: Optional[subprocess.Popen] = None


# ── Connection lifecycle ──────────────────────────────────────────────────────

@socketio.on("connect")
def handle_connect():
    logger.info("Client connected: sid=%s", request.sid)
    emit("message", "WebSocket connection established")


@socketio.on("disconnect")
def handle_disconnect():
    global _current_process
    logger.info("Client disconnected: sid=%s", request.sid)
    packaged_mode = os.environ.get("FLOWVFP_PACKAGED", "0").lower() in {"1", "true", "yes"}
    if packaged_mode:
        logger.info("Packaged mode disconnect detected; keeping simulation process alive")
        return

    if _current_process and _current_process.poll() is None:
        try:
            _current_process.terminate()
            _current_process = None
            logger.info("Terminated running simulation due to client disconnect")
        except Exception as exc:
            logger.warning("Failed to terminate simulation: %s", exc)


@socketio.on("ping")
def handle_ping():
    emit("pong", {"timestamp": time.time()})


# ── Simulation control ────────────────────────────────────────────────────────

@socketio.on("start_simulation")
def start_simulation(msg):
    """
    Launch the VFP engine for the given *vfpData* payload.

    Streams all stdout/stderr output back to the calling client via
    ``message`` events, then emits ``simulation_finished`` (or ``error``)
    when the process exits.
    """
    sid = request.sid
    logger.info("start_simulation received: sid=%s", sid)

    # Capture config values while still inside the request/app context
    # so the background thread doesn't need current_app.
    project_root     = current_app.config["PROJECT_ROOT"]
    simulations_folder = current_app.config["SIMULATIONS_FOLDER"]

    def _run_simulation() -> None:
        global _current_process
        tmp_path: Optional[str] = None

        try:
            logger.info("_run_simulation background task started: sid=%s", sid)
            socketio.emit("message", "[VFP] Preparing simulation payload...", to=sid)

            vfp_data = msg.get("vfpData") if isinstance(msg, dict) else None
            if not vfp_data:
                logger.warning("No vfpData in start_simulation msg: sid=%s", sid)
                socketio.emit("error", "vfpData is required to start a simulation", to=sid)
                return

            sim_name = vfp_data.get("formData", {}).get("simName", "").strip()
            if not sim_name:
                logger.warning("Empty simName in vfpData: sid=%s", sid)
                socketio.emit("error", "Simulation name is required", to=sid)
                return

            logger.info("Starting simulation '%s' for sid=%s", sim_name, sid)
            socketio.emit("message", f"[VFP] Starting simulation: {sim_name}", to=sid)

            # Write vfpData to a temp file so the engine subprocess can read it
            with tempfile.NamedTemporaryFile(
                delete=False, suffix=".vfp", mode="w", encoding="utf-8"
            ) as tf:
                json.dump(vfp_data, tf, indent=2)
                tmp_path = tf.name

            logger.debug("Wrote temp payload: %s", tmp_path)

            vfp_engine = str(project_root / "modules" / "vfp-engine.py")
            modules_dir = str(project_root / "modules")
            existing_pypath = os.environ.get("PYTHONPATH", "")
            new_pypath = (
                modules_dir + os.pathsep + existing_pypath
                if existing_pypath
                else modules_dir
            )
            env = {**os.environ, "PYTHONUNBUFFERED": "1", "PYTHONPATH": new_pypath}

            logger.info("Launching engine subprocess: %s", vfp_engine)
            socketio.emit("message", "[VFP] Launching solver engine...", to=sid)

            _current_process = subprocess.Popen(
                [sys.executable, "-u", vfp_engine, tmp_path],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                env=env,
            )

            logger.info("Engine subprocess started (pid=%s)", _current_process.pid)

            for line in _current_process.stdout:
                if line:
                    socketio.emit("message", line.rstrip(), to=sid)

            _current_process.stdout.close()
            return_code = _current_process.wait()
            logger.info("Engine process exited: code=%s sim=%s", return_code, sim_name)
            _current_process = None

            # Look for the results file — engine saves as {simName}-a{aoa}.vfp
            result_file = _find_vfp_for_sim(simulations_folder, sim_name)

            if result_file and result_file.exists():
                logger.info("Result file found: %s", result_file)
                socketio.emit("simulation_finished", {"simName": sim_name}, to=sid)
            else:
                logger.warning(
                    "No result file found for sim '%s' in %s (exit code %s)",
                    sim_name, simulations_folder, return_code,
                )
                socketio.emit(
                    "error",
                    f"Simulation finished (exit {return_code}) but result file not found.",
                    to=sid,
                )

        except Exception as exc:
            logger.exception("Error in start_simulation for sid=%s", sid)
            socketio.emit("error", f"Internal error running simulation: {exc}", to=sid)
        finally:
            if tmp_path and os.path.exists(tmp_path):
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass

    socketio.start_background_task(_run_simulation)


@socketio.on("stop_simulation")
def stop_simulation():
    global _current_process
    if _current_process and _current_process.poll() is None:
        try:
            _current_process.terminate()
            _current_process = None
            emit("message", "Simulation stopped by user")
        except Exception as exc:
            emit("error", f"Error stopping simulation: {exc}")
    else:
        emit("message", "No simulation is currently running")


# ── Download ──────────────────────────────────────────────────────────────────

@socketio.on("download")
def handle_download(data):
    """Send the ``.vfp`` result archive to the requesting client."""
    sim_name = (data or {}).get("simName", "").strip()
    if not sim_name:
        emit("message", "Error: simulation name is missing.")
        return

    sim_folder = current_app.config["SIMULATIONS_FOLDER"]
    vfp_file = _find_vfp_for_sim(sim_folder, sim_name)

    if not vfp_file:
        emit("message", f"Error: no .vfp file found for simulation '{sim_name}'.")
        return

    try:
        file_data = vfp_file.read_bytes()
        emit("download_ready", {
            "simName":  sim_name,
            "fileName": vfp_file.name,
            "fileData": file_data,
        })
    except Exception as exc:
        logger.exception("Failed to read VFP file for download: %s", vfp_file)
        emit("message", f"Error during download: {exc}")


# ── Simulation folder listing ─────────────────────────────────────────────────

@socketio.on("get_simulation_folder")
def handle_get_simulation_folder(data):
    """Emit a recursive file listing for the requested simulation folder."""
    sim_name = (data or {}).get("simName", "").strip()
    if not sim_name:
        emit("error", {"type": "simulation_folder_error", "message": "Simulation name not provided"})
        return

    sim_folder_path = current_app.config["SIMULATIONS_FOLDER"] / sim_name
    if not sim_folder_path.exists():
        emit("error", {
            "type": "simulation_folder_error",
            "message": f"Simulation folder '{sim_name}' not found",
        })
        return

    files = []
    for root, dirs, filenames in os.walk(str(sim_folder_path)):
        for filename in filenames:
            fp = Path(root) / filename
            rel = fp.relative_to(sim_folder_path)
            files.append({
                "name":        filename,
                "path":        rel.as_posix(),
                "size":        fp.stat().st_size,
                "modified":    fp.stat().st_mtime,
                "isDirectory": False,
            })
        for dirname in dirs:
            dp = Path(root) / dirname
            rel = dp.relative_to(sim_folder_path)
            files.append({
                "name":        dirname,
                "path":        rel.as_posix(),
                "size":        0,
                "modified":    dp.stat().st_mtime,
                "isDirectory": True,
            })

    emit("simulation_folder_ready", {
        "success": True,
        "data": {
            "simName":    sim_name,
            "folderPath": str(sim_folder_path),
            "files":      files,
        },
        "simName": sim_name,
    })


# ── Private helpers ───────────────────────────────────────────────────────────

def _find_any_vfp(folder: Path) -> Optional[Path]:
    for f in folder.iterdir():
        if f.suffix.lower() == ".vfp":
            return f
    return None


def _find_vfp_for_sim(folder: Path, sim_name: str) -> Optional[Path]:
    # Prefer the canonical {simName}.vfp before falling back to stem-prefix match
    candidate = folder / f"{sim_name}.vfp"
    if candidate.exists():
        return candidate
    # Fall back to any .vfp whose stem starts with the sim name
    for f in sorted(folder.iterdir()):
        if f.name.lower().startswith(sim_name.lower()) and f.suffix.lower() == ".vfp":
            return f
    return None

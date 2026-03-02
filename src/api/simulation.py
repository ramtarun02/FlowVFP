"""
Simulation API Blueprint
========================
REST endpoints for initialising and managing VFP simulation cases.
The actual solver execution is driven via Socket.IO (see sockets/simulation.py).
"""
from __future__ import annotations

import logging
import os
import subprocess
import sys
import uuid
import zipfile
from pathlib import Path

from flask import Blueprint, current_app, jsonify, request, send_file

from ..extensions import limiter
from ..utils import safe_filename, safe_join, validate_sim_name
from ..utils.validators import VFP_DATA_SCHEMA, VFP_RESULT_FILES_SCHEMA, validate_json

logger = logging.getLogger("vfp.simulation")

simulation_bp = Blueprint("simulation", __name__)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _write_file(folder: Path, filename: str, content: str) -> str | None:
    """Write *content* to *folder*/*filename*.  Returns an error string or None."""
    try:
        (folder / filename).write_text(content, encoding="utf-8")
        return None
    except Exception as exc:
        return str(exc)


# ── Routes ────────────────────────────────────────────────────────────────────

@simulation_bp.post("/start")
@limiter.limit("20 per minute")
@validate_json(VFP_DATA_SCHEMA)
def start_vfp(data: dict):
    """
    Validate and persist simulation input files to disk.

    Returns the original payload enriched with an ``Initialisation`` node.
    The heavyweight solver run is started via the ``start_simulation`` Socket.IO event.
    """
    form_data   = data["formData"]
    input_files = data["inputFiles"]

    try:
        sim_name = validate_sim_name(form_data.get("simName", "").strip())
    except ValueError as exc:
        return jsonify(error=str(exc)), 422

    sim_folder = current_app.config["SIMULATIONS_FOLDER"] / sim_name
    try:
        sim_folder.mkdir(parents=True, exist_ok=True)
    except Exception as exc:
        logger.exception("Cannot create simulation folder for '%s'", sim_name)
        return jsonify(error="Could not create simulation folder."), 500

    errors: list[str]   = []
    warnings: list[str] = []

    # ── Wing files ────────────────────────────────────────────────────────────
    wing_cfg = input_files.get("wingConfig", {})
    for key, ext in [("GeoFile", ".GEO"), ("MapFile", ".MAP"), ("DatFile", ".DAT")]:
        fname = wing_cfg.get("fileNames", {}).get(key, "")
        fdata = wing_cfg.get("fileData",  {}).get(fname, "")
        if fname and fdata:
            out_name = Path(fname).name
            if not out_name.upper().endswith(ext.upper()):
                out_name = Path(out_name).stem + ext
            err = _write_file(sim_folder, out_name, fdata)
            if err:
                errors.append(f"Wing {key}: {err}")
        else:
            warnings.append(f"Wing {key} missing or empty.")

    # ── Tail files ────────────────────────────────────────────────────────────
    tail_cfg = input_files.get("tailConfig", {})
    for key, ext in [("GeoFile", ".GEO"), ("MapFile", ".MAP"), ("DatFile", ".DAT")]:
        fname = tail_cfg.get("fileNames", {}).get(key, "")
        fdata = tail_cfg.get("fileData",  {}).get(fname, "")
        if fname and fdata:
            out_name = Path(fname).name
            if not out_name.upper().endswith(ext.upper()):
                out_name = Path(out_name).stem + ext
            err = _write_file(sim_folder, out_name, fdata)
            if err:
                errors.append(f"Tail {key}: {err}")
        elif fname:
            warnings.append(f"Tail {key} data missing for {fname}.")

    # ── Body / spec files (optional) ──────────────────────────────────────────
    body_cfg  = input_files.get("bodyFiles", {})
    body_names = body_cfg.get("fileNames", [])
    body_data  = body_cfg.get("fileData",  {})
    for fname in body_names:
        fdata = body_data.get(fname, "")
        if fname and fdata:
            err = _write_file(sim_folder, Path(fname).name, fdata)
            if err:
                errors.append(f"Body file {fname}: {err}")
        elif fname:
            warnings.append(f"Body file data missing for {fname}.")

    if errors:
        data["Initialisation"] = {
            "Solver Status": "VFP Case Failed",
            "Error":         "; ".join(errors),
            "Warnings":      "; ".join(warnings) or None,
        }
        return jsonify(data), 422

    data["Initialisation"] = {
        "Solver Status": "VFP Case created",
        "Error":         None,
        "Warnings":      "; ".join(warnings) or None,
    }
    logger.info("VFP case created: sim_name=%s", sim_name)
    return jsonify(data), 200


@simulation_bp.get("/folder/<sim_name>")
@limiter.limit("60 per minute")
def get_simulation_folder(sim_name: str):
    """Return the file listing for a completed simulation folder."""
    try:
        sim_name = validate_sim_name(sim_name)
    except ValueError as exc:
        return jsonify(error=str(exc)), 422

    sim_folder = current_app.config["SIMULATIONS_FOLDER"] / sim_name
    if not sim_folder.exists():
        return jsonify(error=f"Simulation folder '{sim_name}' not found"), 404

    files = []
    for root, dirs, filenames in os.walk(str(sim_folder)):
        for filename in filenames:
            fp = Path(root) / filename
            rel = fp.relative_to(sim_folder)
            files.append({
                "name":        filename,
                "path":        rel.as_posix(),
                "size":        fp.stat().st_size,
                "modified":    fp.stat().st_mtime,
                "isDirectory": False,
            })
        for dirname in dirs:
            dp = Path(root) / dirname
            rel = dp.relative_to(sim_folder)
            files.append({
                "name":        dirname,
                "path":        rel.as_posix(),
                "size":        0,
                "modified":    dp.stat().st_mtime,
                "isDirectory": True,
            })

    return jsonify(simName=sim_name, files=files)


@simulation_bp.post("/file-content")
@limiter.limit("60 per minute")
def get_file_content():
    """Return text content of a single file inside a simulation folder."""
    data     = request.get_json(silent=True) or {}
    sim_name = data.get("simName", "")
    file_path_rel = data.get("filePath", "")

    if not sim_name or not file_path_rel:
        return jsonify(error="simName and filePath are required"), 400

    try:
        sim_name = validate_sim_name(sim_name)
    except ValueError as exc:
        return jsonify(error=str(exc)), 422

    sim_folder = current_app.config["SIMULATIONS_FOLDER"] / sim_name

    try:
        full_path = safe_join(sim_folder, file_path_rel)
    except PermissionError as exc:
        logger.warning("Path traversal blocked: %s", exc)
        return jsonify(error="Access denied"), 403

    if not full_path.exists():
        return jsonify(error="File not found"), 404

    try:
        content = full_path.read_text(encoding="utf-8", errors="replace")
        return content, 200, {"Content-Type": "text/plain; charset=utf-8"}
    except Exception:
        logger.exception("Failed to read file '%s'", full_path)
        return jsonify(error="Could not read file"), 500


@simulation_bp.post("/upload-data")
@limiter.limit("20 per minute")
def upload_vfp_data():
    """Store a large vfpData payload on disk and return an uploadId."""
    import json

    payload = request.get_json(silent=True)
    if not payload:
        return jsonify(error="JSON body required"), 400

    upload_id = str(uuid.uuid4())
    save_path = current_app.config["UPLOAD_FOLDER"] / f"{upload_id}.json"
    try:
        save_path.write_text(json.dumps(payload), encoding="utf-8")
    except Exception:
        logger.exception("Failed to persist vfpData for upload_id=%s", upload_id)
        return jsonify(error="Failed to store payload"), 500

    return jsonify(uploadId=upload_id)

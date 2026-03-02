"""
Files API Blueprint
===================
Upload .vfp result archives and retrieve split-JSON chunks.
"""
from __future__ import annotations

import json
import logging
import os
import subprocess
import sys
import uuid
from pathlib import Path

from flask import Blueprint, current_app, jsonify, request

from ..extensions import limiter
from ..utils import allowed_file, safe_filename
from ..utils.validators import VFP_RESULT_FILES_SCHEMA, validate_json

logger = logging.getLogger("vfp.files")

files_bp = Blueprint("files", __name__)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _load_vfp_json(vfp_path: Path) -> dict:
    return json.loads(vfp_path.read_text(encoding="utf-8"))


# ── Routes ────────────────────────────────────────────────────────────────────

@files_bp.post("/upload-vfp")
@limiter.limit("10 per minute")
def upload_vfp():
    """
    Accept a ``.vfp`` archive, run the JSON splitter, and return the
    ``main.json`` + ``manifest.json`` split outputs together with the
    ``uploadId`` needed to subsequently fetch individual flow files.
    """
    if "file" not in request.files:
        return jsonify(error="No file part in request"), 400

    file = request.files["file"]
    if not file.filename:
        return jsonify(error="No file selected"), 400

    try:
        filename = safe_filename(file.filename)
    except ValueError as exc:
        return jsonify(error=str(exc)), 400

    if not allowed_file(filename, frozenset({"vfp"})):
        return jsonify(error="Only .vfp files are accepted"), 400

    upload_id  = str(uuid.uuid4())
    upload_dir = current_app.config["UPLOAD_FOLDER"] / upload_id
    upload_dir.mkdir(parents=True)
    upload_path = upload_dir / filename

    try:
        file.save(str(upload_path))
    except Exception:
        logger.exception("Failed to save uploaded file")
        return jsonify(error="Failed to save uploaded file"), 500

    # ── Run json-splitter ─────────────────────────────────────────────────────
    splitter = current_app.config["PROJECT_ROOT"] / "modules" / "json-splitter.py"
    if not splitter.exists():
        logger.error("json-splitter not found at %s", splitter)
        return jsonify(error="Server misconfiguration: JSON splitter not found"), 500

    env = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"}
    result = subprocess.run(
        [sys.executable, str(splitter), str(upload_path)],
        capture_output=True,
        text=True,
        env=env,
        timeout=120,
    )

    if result.returncode != 0:
        logger.warning("json-splitter failed: %s", result.stderr[:500])
        return jsonify(
            error="Failed to split VFP JSON file",
            detail=result.stderr.strip() or result.stdout.strip(),
        ), 500

    split_dir     = upload_dir / "split-json"
    main_file     = split_dir / "main.json"
    manifest_file = split_dir / "manifest.json"

    if not main_file.exists() or not manifest_file.exists():
        return jsonify(error="Splitter produced no output files"), 500

    try:
        main_json     = json.loads(main_file.read_text(encoding="utf-8"))
        manifest_json = json.loads(manifest_file.read_text(encoding="utf-8"))
    except Exception:
        logger.exception("Failed to read splitter output")
        return jsonify(error="Failed to read splitter output"), 500

    return jsonify(
        uploadId=upload_id,
        uploadedFileName=filename,
        main=main_json,
        manifest=manifest_json,
    )


@files_bp.post("/vfp-result-files")
@limiter.limit("60 per minute")
@validate_json(VFP_RESULT_FILES_SCHEMA)
def get_vfp_result_files(data: dict):
    """
    Return a grouped file listing for a specific flow within an uploaded VFP archive.
    """
    upload_id    = data["uploadId"]
    vfp_file_name = data["vfpFileName"]
    flow_file    = data["flowFile"]

    upload_dir   = current_app.config["UPLOAD_FOLDER"] / upload_id
    split_dir    = upload_dir / "split-json"
    target_name  = flow_file if flow_file.lower().endswith(".json") else f"{flow_file}.json"
    vfp_path     = split_dir / target_name

    if not vfp_path.exists():
        logger.error("VFP JSON not found: upload_id=%s path=%s", upload_id, vfp_path)
        return jsonify(error="VFP file not found for the provided uploadId"), 404

    try:
        vfp_json = _load_vfp_json(vfp_path)
    except Exception:
        logger.exception("Failed to load VFP JSON from %s", vfp_path)
        return jsonify(error="Failed to read VFP file"), 500

    file_groups: dict[str, list] = {}
    KNOWN_TYPES = {"cp", "dat", "forces", "geo", "map", "txt", "log", "vis", "conv", "sum"}
    for fname in vfp_json:
        ext = fname.rsplit(".", 1)[-1].lower() if "." in fname else "other"
        key = ext if ext in KNOWN_TYPES else "other"
        file_groups.setdefault(key, []).append({"name": fname})

    return jsonify(file_groups)

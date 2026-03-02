"""
Post-Processing API Blueprint
==============================
Parse CP, Forces, DAT, and VIS files; compute contour grids; tail downwash.
"""
from __future__ import annotations

import json
import logging
import os
import tempfile
import uuid
from pathlib import Path

import numpy as np
from flask import Blueprint, current_app, jsonify, request
from scipy.interpolate import griddata

from ..extensions import limiter
from ..utils import allowed_file, safe_filename
from ..utils.validators import CONTOUR_GRID_SCHEMA, validate_json

logger = logging.getLogger("vfp.postprocessing")

postprocessing_bp = Blueprint("postprocessing", __name__)


# ── Lazy imports ──────────────────────────────────────────────────────────────
def _get_vfp_readers():
    from modules.vfp_processing.readVFP import readVIS, readCP, readFORCE, readFLOW
    return readVIS, readCP, readFORCE, readFLOW


# ── Helpers ───────────────────────────────────────────────────────────────────

def _clean_grid(arr: np.ndarray) -> list:
    """Replace NaN/Inf with *None* so jsonify can serialise the array."""
    return np.where(np.isfinite(arr), arr, np.nan).tolist()


def _parse_file_upload(allowed_ext: str, *, parser_fn, sim_name: str = "unknown"):
    """
    Shared logic: accept a file upload, save it to a temp location, parse it
    with *parser_fn*, clean up, and return a Flask response.
    """
    if "file" not in request.files:
        return jsonify(error="No file provided"), 400
    file = request.files["file"]
    if not file.filename:
        return jsonify(error="No file selected"), 400

    try:
        filename = safe_filename(file.filename)
    except ValueError as exc:
        return jsonify(error=str(exc)), 400

    if not file.filename.lower().endswith(f".{allowed_ext}"):
        return jsonify(error=f"Expected a .{allowed_ext} file"), 400

    tmp_path = current_app.config["TEMP_FOLDER"] / f"parse_{uuid.uuid4().hex}_{filename}"
    try:
        file.save(str(tmp_path))
        parsed = parser_fn(str(tmp_path))
        if parsed is None:
            return jsonify(error=f"Failed to parse {allowed_ext.upper()} file"), 500
        return jsonify(parsed), 200
    except Exception:
        logger.exception("Error parsing %s file '%s'", allowed_ext.upper(), filename)
        return jsonify(error=f"Failed to parse {allowed_ext.upper()} file"), 500
    finally:
        tmp_path.unlink(missing_ok=True)


# ── Routes ────────────────────────────────────────────────────────────────────

@postprocessing_bp.post("/parse-cp")
@limiter.limit("60 per minute")
def parse_cp():
    """Parse a .cp pressure-coefficient file."""
    _, readCP, _, _ = _get_vfp_readers()
    sim_name = request.form.get("simName", "unknown")
    return _parse_file_upload("cp", parser_fn=readCP, sim_name=sim_name)


@postprocessing_bp.post("/parse-forces")
@limiter.limit("60 per minute")
def parse_forces():
    """Parse a .forces aerodynamic-force file."""
    _, _, readFORCE, _ = _get_vfp_readers()
    sim_name = request.form.get("simName", "unknown")
    return _parse_file_upload("forces", parser_fn=readFORCE, sim_name=sim_name)


@postprocessing_bp.post("/parse-dat")
@limiter.limit("60 per minute")
def parse_dat():
    """Parse a .dat flow-data file."""
    _, _, _, readFLOW = _get_vfp_readers()
    sim_name = request.form.get("simName", "unknown")
    return _parse_file_upload("dat", parser_fn=readFLOW, sim_name=sim_name)


@postprocessing_bp.post("/parse-vis")
@limiter.limit("60 per minute")
def parse_vis():
    """Parse a .vis boundary-layer file."""
    readVIS, _, _, _ = _get_vfp_readers()
    sim_name = request.form.get("simName", "unknown")
    return _parse_file_upload("vis", parser_fn=readVIS, sim_name=sim_name)


@postprocessing_bp.post("/parse-vfp-file")
@limiter.limit("60 per minute")
def parse_vfp_file():
    """
    Parse a single result file from a previously-uploaded VFP JSON archive.

    Expected JSON body:
        vfpFileName   – filename (not used; kept for backwards-compat)
        uploadId      – UUID returned by /api/files/upload-vfp
        flowFile      – name of the split-JSON chunk (e.g. ``flow1.json``)
        fileType      – ``cp`` | ``forces`` | ``dat`` | ``vis``
    """
    readVIS, readCP, readFORCE, readFLOW = _get_vfp_readers()
    data = request.get_json(silent=True) or {}

    upload_id   = data.get("uploadId", "")
    flow_file   = data.get("flowFile", "")
    file_type   = (data.get("fileType") or "").lower()

    if not upload_id or not flow_file or not file_type:
        return jsonify(error="uploadId, flowFile, and fileType are required"), 400

    PARSER_MAP = {"cp": readCP, "forces": readFORCE, "dat": readFLOW, "vis": readVIS}
    if file_type not in PARSER_MAP:
        return jsonify(error=f"Unknown fileType '{file_type}'"), 400

    target_name = flow_file if flow_file.lower().endswith(".json") else f"{flow_file}.json"
    vfp_path    = current_app.config["UPLOAD_FOLDER"] / upload_id / "split-json" / target_name

    if not vfp_path.exists():
        return jsonify(error="VFP file not found"), 404

    try:
        vfp_json = json.loads(vfp_path.read_text(encoding="utf-8"))
    except Exception:
        logger.exception("Failed to load VFP JSON from %s", vfp_path)
        return jsonify(error="Failed to read VFP file"), 500

    # Find first file of the requested type
    file_obj = None
    file_name = None
    for fname, content in vfp_json.items():
        if fname.lower().endswith(f".{file_type}"):
            file_obj  = content
            file_name = fname
            break

    if not file_obj:
        return jsonify(error=f"No .{file_type} file found in archive"), 404

    tmp_path = current_app.config["TEMP_FOLDER"] / f"parse_{uuid.uuid4().hex}_{file_name}"
    try:
        encoding = file_obj.get("encoding", "utf-8")
        if encoding == "utf-8":
            tmp_path.write_text(file_obj["data"], encoding="utf-8")
        elif encoding == "base64":
            import base64
            tmp_path.write_bytes(base64.b64decode(file_obj["data"]))
        else:
            return jsonify(error=f"Unsupported encoding: {encoding}"), 500

        parsed = PARSER_MAP[file_type](str(tmp_path))
        if parsed is None:
            return jsonify(error=f"Parser returned no data for .{file_type}"), 500
        return jsonify(parsed), 200
    except Exception:
        logger.exception("Error parsing %s from VFP archive", file_type)
        return jsonify(error=f"Failed to parse {file_type.upper()} file"), 500
    finally:
        tmp_path.unlink(missing_ok=True)


@postprocessing_bp.post("/contour-grid")
@limiter.limit("30 per minute")
@validate_json(CONTOUR_GRID_SCHEMA)
def contour_grid(data: dict):
    """
    Build a 2-D meshgrid from CP point-cloud data in preparation for contour
    plotting on the client side.
    """
    cp_data      = data["cp_data"]
    level        = data["level"]
    contour_type = data["contour_type"]
    surface_type = data["surface_type"]
    threshold    = float(data.get("threshold", 0))
    n_grid       = int(data.get("n_grid", 150))

    try:
        level_data = cp_data["levels"][level]
    except (KeyError, TypeError):
        return jsonify(error=f"Level '{level}' not found in cp_data"), 400

    sections = level_data.get("sections", {})
    x_list: list[float] = []
    y_list: list[float] = []
    val_list: list[float] = []

    import re

    for sec in sections.values():
        x_vals = sec.get("XPHYS", [])
        vals   = sec.get(contour_type, [])
        yave   = sec.get("coefficients", {}).get("YAVE")
        if yave is None:
            m = re.search(r"YAVE=\s*([\d.-]+)", sec.get("sectionHeader", ""))
            yave = float(m.group(1)) if m else None
        if yave is None or not x_vals or not vals or len(x_vals) != len(vals):
            continue
        min_idx = x_vals.index(min(x_vals))
        top_idx = len(x_vals) - 1
        indices = (
            range(min_idx, top_idx + 1) if surface_type == "upper"
            else range(0, min_idx + 1)
        )
        for i in indices:
            v = vals[i]
            if v >= threshold:
                x_list.append(x_vals[i])
                y_list.append(yave)
                val_list.append(v)

    if not x_list:
        return jsonify(error="No data points found for the specified parameters"), 400

    x_arr = np.array(x_list)
    y_arr = np.array(y_list)
    val_arr = np.array(val_list)

    xi_1d = np.linspace(x_arr.min(), x_arr.max(), n_grid)
    yi_1d = np.linspace(y_arr.min(), y_arr.max(), n_grid)
    xi, yi = np.meshgrid(xi_1d, yi_1d)
    zi = griddata((x_arr, y_arr), val_arr, (xi, yi), method="linear")

    return jsonify(x=_clean_grid(xi), y=_clean_grid(yi), z=_clean_grid(zi))


@postprocessing_bp.post("/tail-downwash")
@limiter.limit("30 per minute")
def compute_tail_downwash():
    """
    Compute tail-plane downwash (epsilon) and average local Mach from uploaded
    ``.tail``, ``.GEO``, and ``.cp`` files.
    """
    tail_file = request.files.get("tail")
    geo_file  = request.files.get("geo")
    cp_file   = request.files.get("cp")

    if not all([tail_file, geo_file, cp_file]):
        return jsonify(error="Missing one or more required files (.tail, .GEO, .cp)"), 400
    if not all([tail_file.filename, geo_file.filename, cp_file.filename]):
        return jsonify(error="One or more files have empty filename"), 400

    with (
        tempfile.NamedTemporaryFile(delete=False) as tf_tail,
        tempfile.NamedTemporaryFile(delete=False) as tf_geo,
        tempfile.NamedTemporaryFile(delete=False) as tf_cp,
    ):
        tf_tail.write(tail_file.read())
        tf_geo.write(geo_file.read())
        tf_cp.write(cp_file.read())
        tail_path = tf_tail.name
        geo_path  = tf_geo.name
        cp_path   = tf_cp.name

    try:
        from modules.vfp_processing.downwashLLT import compute_downwash_LLT
        results = compute_downwash_LLT(cp_path, geo_path, tail_path, save_plots=False)
        eps_val  = results.get("effective_epsilon_deg")
        mach_val = results.get("avg_local_mach")
        return jsonify(
            effective_epsilon_deg=float(eps_val)  if eps_val  is not None else None,
            avg_local_mach       =float(mach_val) if mach_val is not None else None,
        )
    except ImportError as exc:
        logger.exception("Import error in tail_downwash")
        return jsonify(error="Server misconfiguration — downwash module unavailable"), 500
    except Exception:
        logger.exception("Computation error in tail_downwash")
        return jsonify(error="Downwash computation failed"), 500
    finally:
        for p in (tail_path, geo_path, cp_path):
            try:
                os.unlink(p)
            except OSError:
                pass

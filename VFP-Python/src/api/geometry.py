"""
Geometry API Blueprint
======================
Handles .GEO file import/export, section editing, parameter interpolation
and FPCON (geometry plan-form conversion) execution.
"""
from __future__ import annotations

import copy
import io
import logging
import math
import os
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

from flask import Blueprint, current_app, jsonify, request, send_file
from werkzeug.exceptions import BadRequest

from ..extensions import limiter
from ..utils import allowed_file, safe_filename, safe_join
from ..utils.validators import validate_json, INTERPOLATE_SCHEMA

logger = logging.getLogger("vfp.geometry")

geometry_bp = Blueprint("geometry", __name__)

# ── Lazy VFP module imports ────────────────────────────────────────────────────
def _get_read_geo():
    from modules.vfp_processing import readGEO as rG
    return rG


# ── Routes ────────────────────────────────────────────────────────────────────

@geometry_bp.post("/import")
@limiter.limit("60 per minute")
def import_geo():
    """Upload one or more .GEO files and return parsed geometry + plot data."""
    if "files" not in request.files:
        return jsonify(error="No files provided"), 400

    files = request.files.getlist("files")
    if not files or all(f.filename == "" for f in files):
        return jsonify(error="No files selected"), 400

    rG = _get_read_geo()
    upload_folder = current_app.config["UPLOAD_FOLDER"]
    results: list[dict] = []

    for file in files:
        if not file.filename:
            continue

        try:
            filename = safe_filename(file.filename)
        except ValueError as exc:
            results.append({"filename": file.filename, "error": str(exc)})
            continue

        if not allowed_file(filename, frozenset({"geo"})):
            results.append({"filename": filename, "error": "Only .GEO files are accepted."})
            continue

        file_path = upload_folder / filename
        try:
            file.save(str(file_path))
            parsed = rG.readGEO(str(file_path))
            sections = parsed["sections"]
            body_data = {"xrad": parsed["xrad"], "rad": parsed["rad"]}
            plot_data = rG.airfoils(copy.deepcopy(sections))
            results.append({"filename": filename, "geoData": sections, "bodyData": body_data, "plotData": plot_data})
        except Exception as exc:
            logger.exception("Error processing GEO file '%s'", filename)
            results.append({"filename": filename, "error": "Failed to process file."})
        finally:
            if file_path.exists():
                file_path.unlink(missing_ok=True)

    return jsonify(results=results), 200


@geometry_bp.post("/export")
@limiter.limit("30 per minute")
def export_geo():
    """Serialise in-memory geometry back to a .GEO file and return it."""
    data = request.get_json(silent=True)
    if not data:
        return jsonify(error="JSON body required"), 400

    geo_data = data.get("geoData")
    body_data = data.get("bodyData", {})
    original_filename = data.get("filename", "wing.GEO")

    if not geo_data:
        return jsonify(error="No geoData provided"), 400

    rG = _get_read_geo()
    temp_folder = current_app.config["TEMP_FOLDER"]

    try:
        base = original_filename
        if base.upper().endswith(".GEO"):
            base = base[:-4]
        download_name = f"{base}_modified.GEO"
        temp_path = temp_folder / f"export_{os.urandom(8).hex()}_{download_name}"
        xrad = body_data.get("xrad", None) or None
        rad = body_data.get("rad", None) or None
        rG.writeGEO(str(temp_path), geo_data, xrad=xrad, rad=rad)
        buf = io.BytesIO(temp_path.read_bytes())
        temp_path.unlink(missing_ok=True)
        return send_file(
            buf,
            as_attachment=True,
            download_name=download_name,
            mimetype="application/octet-stream",
        )
    except Exception as exc:
        logger.exception("Error exporting GEO file")
        return jsonify(error="Failed to export geometry file."), 500
    finally:
        if "temp_path" in dir() and temp_path.exists():
            temp_path.unlink(missing_ok=True)


@geometry_bp.post("/compute-desired")
@limiter.limit("120 per minute")
def compute_desired():
    """Apply a single per-section parameter change and return updated data."""
    data = request.get_json(silent=True)
    if not data:
        return jsonify(error="JSON body required"), 400

    section_index = data.get("sectionIndex")
    parameters    = data.get("parameters", {})
    geo_data      = data.get("geoData", [])
    plot_data     = data.get("plotData", [])

    if section_index is None or not isinstance(section_index, int):
        return jsonify(error="sectionIndex (integer) is required"), 422
    if not (0 <= section_index < len(geo_data)):
        return jsonify(error="sectionIndex out of range"), 422

    rG = _get_read_geo()

    try:
        i = section_index
        current_section = geo_data[i]
        chord = current_section["G2SECT"] - current_section["G1SECT"]

        new_xle      = float(parameters.get("XLE",      current_section["G1SECT"]))
        new_xte      = float(parameters.get("XTE",      current_section["G2SECT"]))
        new_twist    = float(parameters.get("Twist",    current_section["TWIST"]))
        new_dihedral = float(parameters.get("Dihedral", current_section["HSECT"]))
        new_ysect    = float(parameters.get("YSECT",    current_section["YSECT"]))
        new_chord    = float(parameters.get("Chord",    chord))

        geometry_changed = False

        if "YSECT" in parameters and abs(new_ysect - current_section["YSECT"]) > 1e-5:
            current_section["YSECT"] = new_ysect
            geometry_changed = True
        if "XLE" in parameters and abs(new_xle - current_section["G1SECT"]) > 1e-5:
            current_section["G1SECT"] = new_xle
            geometry_changed = True
        if "XTE" in parameters and abs(new_xte - current_section["G2SECT"]) > 1e-5:
            current_section["G2SECT"] = new_xte
            geometry_changed = True
        if "Chord" in parameters and abs(new_chord - chord) > 1e-5:
            current_section["G2SECT"] = current_section["G1SECT"] + new_chord
            geometry_changed = True

        if geometry_changed:
            plot_data = rG.airfoils(geo_data)

        twist_changed    = "Twist"    in parameters and abs(new_twist    - current_section["TWIST"]) > 1e-4
        dihedral_changed = "Dihedral" in parameters and abs(new_dihedral - current_section["HSECT"]) > 1e-4

        if twist_changed or dihedral_changed:
            section_plot = plot_data[i]
            if twist_changed:
                dtwist_rad  = (new_twist - current_section["TWIST"]) * (math.pi / 180)
                chord_local = current_section["G2SECT"] - current_section["G1SECT"]
                xtwsec_abs  = current_section["G1SECT"] + current_section["XTWSEC"] * chord_local
                hsect       = current_section["HSECT"]

                def _rotate(xs, zs):
                    rotated_x, rotated_z = [], []
                    for x, z in zip(xs, zs):
                        dx, dz = x - xtwsec_abs, z - hsect
                        rotated_x.append(dx * math.cos(-dtwist_rad) - dz * math.sin(-dtwist_rad) + xtwsec_abs)
                        rotated_z.append(dx * math.sin(-dtwist_rad) + dz * math.cos(-dtwist_rad) + hsect)
                    return rotated_x, rotated_z

                section_plot["xus_n"], section_plot["zus_n"] = _rotate(section_plot["xus"], section_plot["zus"])
                section_plot["xls_n"], section_plot["zls_n"] = _rotate(section_plot["xls"], section_plot["zls"])

            if dihedral_changed:
                delta_z = new_dihedral - current_section["HSECT"]
                section_plot["zus_n"] = [z + delta_z for z in section_plot.get("zus_n", section_plot["zus"])]
                section_plot["zls_n"] = [z + delta_z for z in section_plot.get("zls_n", section_plot["zls"])]

        if twist_changed:
            current_section["TWIST"] = new_twist
        if dihedral_changed:
            current_section["HSECT"] = new_dihedral

        return jsonify(updatedGeoData=geo_data, updatedPlotData=plot_data)

    except Exception:
        logger.exception("Error in compute_desired")
        return jsonify(error="Computation failed"), 500


@geometry_bp.post("/interpolate-parameter")
@limiter.limit("120 per minute")
@validate_json(INTERPOLATE_SCHEMA)
def interpolate_parameter(data: dict):
    """Interpolate a geometry parameter across a span range using the chosen method."""
    rG = _get_read_geo()

    geo_data      = data["geoData"]
    plot_data     = data.get("plotData", [])
    parameter     = data["parameter"]
    start_section = data["startSection"]
    end_section   = data["endSection"]
    method        = data.get("method", None)
    a_value       = float(data.get("aValue", 0))
    n_power       = float(data.get("n", 2.0))
    kink_eta      = float(data.get("kinkEta", 0.5))
    kink_value    = data.get("kinkValue", None)
    slope_start   = float(data.get("slopeStart", 0.0))
    slope_end     = float(data.get("slopeEnd", 0.0))
    decay         = float(data.get("decay", 1.0))

    if start_section > end_section:
        return jsonify(error="startSection must be ≤ endSection"), 422
    if start_section >= len(geo_data) or end_section >= len(geo_data):
        return jsonify(error="Section index out of range"), 422

    if method is None:
        method = "quadratic" if abs(a_value) >= 1e-10 else "linear"

    param_key_map = {"Twist": "TWIST", "Dihedral": "HSECT", "XLE": "G1SECT"}
    geo_key     = param_key_map[parameter]
    start_value = geo_data[start_section][geo_key]
    end_value   = geo_data[end_section][geo_key]
    num_sections = end_section - start_section + 1

    def _interp(t: float, f0: float, f1: float) -> float:
        if method == "linear":
            return f0 + t * (f1 - f0)
        if method == "quadratic":
            c = f0
            b = f1 - a_value - f0
            return a_value * t * t + b * t + c
        if method == "elliptical":
            shape = math.sqrt(max(0.0, 1.0 - (1.0 - t) ** 2))
            return f0 + (f1 - f0) * shape
        if method == "cosine":
            return f0 + (f1 - f0) * 0.5 * (1.0 - math.cos(math.pi * t))
        if method == "power":
            return f0 + (f1 - f0) * (t ** n_power)
        if method == "schuemann":
            kv = float(kink_value) if kink_value is not None else f0 + (f1 - f0) * kink_eta
            if t <= kink_eta:
                local_t = (t / kink_eta) if kink_eta > 1e-10 else 0.0
                return f0 + (kv - f0) * local_t
            span_outer = 1.0 - kink_eta
            local_t = ((t - kink_eta) / span_outer) if span_outer > 1e-10 else 1.0
            return kv + (f1 - kv) * local_t
        if method == "hermite":
            t2, t3 = t * t, t * t * t
            h00 =  2*t3 - 3*t2 + 1
            h10 =    t3 - 2*t2 + t
            h01 = -2*t3 + 3*t2
            h11 =    t3 -   t2
            return h00 * f0 + h10 * slope_start + h01 * f1 + h11 * slope_end
        if method == "exponential":
            if abs(decay) < 1e-10:
                return f0 + t * (f1 - f0)
            exp_d = math.exp(decay)
            A_ = (f1 - f0) / (exp_d - 1.0)
            C_ = f0 - A_
            return A_ * math.exp(decay * t) + C_
        raise ValueError(f"Unknown method: {method}")

    try:
        for i in range(num_sections):
            if num_sections == 1:
                break
            t = i / (num_sections - 1)
            geo_data[start_section + i][geo_key] = _interp(t, start_value, end_value)

        if parameter == "XLE":
            for i in range(start_section, end_section + 1):
                curr_chord = geo_data[i]["G2SECT"] - geo_data[i]["G1SECT"]
                geo_data[i]["G2SECT"] = geo_data[i]["G1SECT"] + curr_chord

        updated_plot_data = rG.airfoils(copy.deepcopy(geo_data))
        return jsonify(updatedGeoData=geo_data, updatedPlotData=updated_plot_data)

    except Exception:
        logger.exception("Error in interpolate_parameter")
        return jsonify(error="Interpolation failed"), 500


# ── FPCON ─────────────────────────────────────────────────────────────────────

@geometry_bp.post("/fpcon")
@limiter.limit("10 per minute")
def fpcon():
    """
    Run the ``fpcon`` geometry generator tool.

    Accepts a multipart form with wing parameters and optional airfoil section
    files. On success returns a ZIP archive containing the generated
    ``*.GEO``, ``*.MAP``, ``FLOW.DAT``, ``GEOSUP.DAT``, and ``RESPIN.DAT``.
    """
    try:
        geo_name     = request.form.get("geoName", "").strip()
        aspect_ratio = request.form.get("aspectRatio", "")
        taper_ratio  = request.form.get("taperRatio", "")
        sweep_angle  = request.form.get("sweepAngle", "")
        nsect        = int(request.form.get("nsect", 1))
        nchange      = int(request.form.get("nchange", 0))
        body_radius  = request.form.get("bodyRadius", "0.0")
        clcd_conv    = request.form.get("clcd_conv", "n")
        mach         = request.form.get("mach", "0.0")
        incidence    = request.form.get("incidence", "0.0")

        # Validate geo_name before using it as a directory name
        try:
            safe_filename(geo_name + ".GEO")  # raises if illegal chars present
        except ValueError as exc:
            return jsonify(error=f"Invalid geoName: {exc}"), 400

        change_sections_raw = request.form.getlist("changeSections[]") or []
        change_sections: list[str] = []
        for val in change_sections_raw:
            for part in str(val).replace(",", "-").split("-"):
                p = part.strip()
                if p:
                    change_sections.append(p)

        etas   = request.form.getlist("etas[]")   or ["0"] * nsect
        hsect  = request.form.getlist("hsect[]")  or ["0"] * nsect
        xtwsec = request.form.getlist("xtwsec[]") or ["0"] * nsect
        twsin  = request.form.getlist("twsin[]")  or ["0"] * nsect

        upload_folder = current_app.config["UPLOAD_FOLDER"]
        tools_folder  = current_app.config["TOOLS_FOLDER"]

        upload_dir = upload_folder / geo_name
        upload_dir.mkdir(parents=True, exist_ok=True)

        # ── Save uploaded airfoil files ────────────────────────────────────────
        file_names: list[str] = []
        for _key in request.files:
            f = request.files[_key]
            if f.filename:
                fname = safe_filename(f.filename)
                f.save(str(upload_dir / fname))
                file_names.append(fname)

        # ── Build EXIN1.DAT ────────────────────────────────────────────────────
        exin1_path = upload_dir / "EXIN1.DAT"
        with exin1_path.open("w") as fh:
            fh.write("n\n")
            fh.write(f"   {float(aspect_ratio):.5f}      {float(taper_ratio):.7f}\n")
            fh.write(f"   {float(sweep_angle):.6f}\n")
            fh.write(f"           {nsect}\n")
            fh.write(f"           {nchange}\n")
            for sec in change_sections:
                fh.write(f"           {sec}\n")
            for fname in file_names:
                fh.write(f"{fname}\n")
            for i in range(nsect):
                eta = float(etas[i])   if i < len(etas)   else 0.0
                h   = float(hsect[i])  if i < len(hsect)  else 0.0
                x   = float(xtwsec[i]) if i < len(xtwsec) else 0.0
                t   = float(twsin[i])  if i < len(twsin)  else 0.0
                fh.write(f"  {eta:.7f}      {h:.7f}      {x:.7f}      {t:.7f}\n")
            fh.write(f"  {float(body_radius):.7f}\n")
            fh.write(f"{geo_name}\n")
            fh.write(f"{clcd_conv}\n")
            fh.write(f"  {float(mach):.7f}      {float(incidence):.7f}\n")

        # ── Copy fpcon tool binaries ────────────────────────────────────────────
        fpcon_dir = tools_folder / "fpcon"
        if fpcon_dir.exists():
            for item in fpcon_dir.iterdir():
                if item.is_file():
                    shutil.copy2(str(item), str(upload_dir / item.name))

        # ── Run fpcon ───────────────────────────────────────────────────────────
        try:
            subprocess.run(
                ["cmd.exe", "/c", "fpcon < EXIN1.dat"],
                cwd=str(upload_dir),
                check=True,
                timeout=30,
                capture_output=True,
            )
        except subprocess.CalledProcessError as exc:
            return jsonify(error=f"fpcon exited with code {exc.returncode}"), 500
        except subprocess.TimeoutExpired:
            return jsonify(error="fpcon timed out"), 500

        # ── Rename output files ────────────────────────────────────────────────
        _rename = upload_dir
        if (_rename / "GEO.DAT").exists():
            (_rename / "GEO.DAT").replace(_rename / f"{geo_name}.GEO")
        if (_rename / "MAP.DAT").exists():
            (_rename / "MAP.DAT").replace(_rename / f"{geo_name}.map")

        # ── Package outputs into ZIP ───────────────────────────────────────────
        candidates = [
            _rename / f"{geo_name}.GEO",
            _rename / f"{geo_name}.map",
            _rename / "FLOW.DAT",
            _rename / "GEOSUP.DAT",
            _rename / "RESPIN.DAT",
        ]
        missing = [f.name for f in candidates if not f.exists()]
        if missing:
            return jsonify(error=f"Missing output files: {', '.join(missing)}"), 500

        zip_path = upload_dir / f"{geo_name}_vfp_files.zip"
        with zipfile.ZipFile(str(zip_path), "w") as zf:
            for f in candidates:
                zf.write(str(f), arcname=f.name)

        return send_file(
            str(zip_path),
            as_attachment=True,
            download_name=f"{geo_name}_vfp_files.zip",
            mimetype="application/zip",
        )

    except Exception:
        logger.exception("Unhandled error in fpcon endpoint")
        return jsonify(error="fpcon processing failed"), 500


# ── GEO → MAP (geo2fpcon) ────────────────────────────────────────────────────

def _get_geo2fpcon():
    """Lazy import of the geo2fpcon helper module."""
    import importlib.util, types
    tools = Path(__file__).resolve().parent.parent.parent / "tools" / "geo2fpcon.py"
    spec = importlib.util.spec_from_file_location("geo2fpcon", str(tools))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@geometry_bp.post("/geo2map")
@limiter.limit("10 per minute")
def geo2map():
    """
    Generate MAP and FLOW files from in-memory geoData.

    Accepts JSON:
        geoData      – sections array (as returned by /import)
        filename     – original GEO filename (for labelling)
        mach         – Mach number  (default 0.0)
        incidence    – incidence in degrees  (default 0.0)

    Returns a ZIP with the MAP, FLOW, GEOSUP, and RESPIN files.
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify(error="JSON body required"), 400

    geo_data = data.get("geoData")
    if not geo_data or not isinstance(geo_data, list):
        return jsonify(error="geoData (section list) is required"), 400

    body_data = data.get("bodyData", {})
    body_radius_override = data.get("bodyRadius", None)
    filename = data.get("filename", "wing")
    mach = float(data.get("mach", 0.0))
    incidence = float(data.get("incidence", 0.0))

    rG = _get_read_geo()
    g2f = _get_geo2fpcon()

    # Sanitise the filename for use as a directory / label
    base = filename
    if base.upper().endswith(".GEO"):
        base = base[:-4]
    try:
        safe_filename(base + ".GEO")
    except ValueError as exc:
        return jsonify(error=f"Invalid filename: {exc}"), 400

    temp_folder = current_app.config["TEMP_FOLDER"]
    work_dir = temp_folder / f"geo2map_{os.urandom(8).hex()}"
    work_dir.mkdir(parents=True, exist_ok=True)

    try:
        # 1. Write geoData → temporary GEO file using writeGEO
        geo_path = work_dir / f"{base}.GEO"
        xrad = body_data.get("xrad", None) or None
        rad = body_data.get("rad", None) or None
        rG.writeGEO(str(geo_path), geo_data, xrad=xrad, rad=rad)

        # 2. Parse with geo2fpcon's own parser (handles body data etc.)
        parsed = g2f.parse_geo(geo_path)
        sections = parsed["sections"]
        planform = g2f.compute_planform(sections)

        # Body radius: user override takes priority, else average from GEO body data
        if body_radius_override is not None:
            body_radius = float(body_radius_override)
        elif parsed["nrad"] > 0 and parsed["rad"]:
            body_radius = sum(parsed["rad"]) / len(parsed["rad"])
        else:
            body_radius = 0.0

        # 3. Extract airfoil .dat files
        dat_files = g2f.extract_dat_files(sections, work_dir, base)

        # 4. Build EXIN1.DAT
        exin1_path = work_dir / "EXIN1.DAT"
        g2f.build_exin1(
            planform, sections, dat_files,
            title=base,
            mach=mach,
            incidence=incidence,
            body_radius=body_radius,
            filepath=exin1_path,
        )

        # 5. Locate fpcon tools and run
        tools_folder = current_app.config["TOOLS_FOLDER"]
        fpcon_dir = tools_folder / "fpcon"
        if not (fpcon_dir / "fpcon.exe").exists():
            return jsonify(error="fpcon.exe not found on server"), 500

        g2f.run_fpcon(work_dir, fpcon_dir, timeout=30)

        # 6. Rename outputs
        if (work_dir / "MAP.DAT").exists():
            (work_dir / "MAP.DAT").replace(work_dir / f"{base}.MAP")
        if (work_dir / "GEO.DAT").exists():
            (work_dir / "GEO.DAT").replace(work_dir / f"{base}_fpcon.GEO")

        # 7. Package into ZIP
        candidates = [
            (work_dir / f"{base}.MAP", f"{base}.MAP"),
            (work_dir / "FLOW.DAT", "FLOW.DAT"),
            (work_dir / "GEOSUP.DAT", "GEOSUP.DAT"),
            (work_dir / "RESPIN.DAT", "RESPIN.DAT"),
        ]
        missing = [name for path, name in candidates if not path.exists()]
        if missing:
            return jsonify(error=f"fpcon did not produce: {', '.join(missing)}"), 500

        zip_path = work_dir / f"{base}_map_files.zip"
        with zipfile.ZipFile(str(zip_path), "w") as zf:
            for fpath, arcname in candidates:
                zf.write(str(fpath), arcname=arcname)

        return send_file(
            str(zip_path),
            as_attachment=True,
            download_name=f"{base}_map_files.zip",
            mimetype="application/zip",
        )

    except subprocess.CalledProcessError as exc:
        logger.exception("fpcon failed in geo2map")
        return jsonify(error=f"fpcon exited with code {exc.returncode}"), 500
    except subprocess.TimeoutExpired:
        return jsonify(error="fpcon timed out"), 500
    except Exception:
        logger.exception("Unhandled error in geo2map endpoint")
        return jsonify(error="geo2map processing failed"), 500
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)

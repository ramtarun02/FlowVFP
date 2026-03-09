#!/usr/bin/env python3
"""
geo2fpcon.py – Generate MAP and FLOW files from an existing VFP .GEO file
=========================================================================

When a user already has a .GEO file (e.g. modified via the Geometry Module),
this script extracts the planform parameters, creates individual airfoil
.dat files for each unique section, builds the EXIN1.DAT input, and runs
``fpcon.exe`` to produce the MAP.DAT and FLOW.DAT files needed by VFP.

Supported planform types
------------------------
* Simple straight-tapered wings  (auto-detected)
* Cranked wings with a single kink  (auto-detected)

Usage
-----
::

    python geo2fpcon.py <geo_file> [options]

    # Minimal – auto-detect everything, Mach 0.0 / incidence 0.0:
    python geo2fpcon.py path/to/wing.GEO

    # Specify flow conditions:
    python geo2fpcon.py wing.GEO --mach 0.75 --incidence 2.0

    # Custom output directory and title:
    python geo2fpcon.py wing.GEO -o results/ --title "My Wing"

    # Point to a non-default fpcon tools directory:
    python geo2fpcon.py wing.GEO --fpcon-dir /path/to/fpcon
"""
from __future__ import annotations

import argparse
import math
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any


# ──────────────────────────────────────────────────────────────────────────────
# GEO parser
# ──────────────────────────────────────────────────────────────────────────────

def parse_geo(filepath: str | Path) -> dict[str, Any]:
    """
    Parse a VFP ``.GEO`` file.

    Returns
    -------
    dict with keys:
        sections : list[dict]   – per-section geometry data
        nrad     : int          – number of body-radius stations
        xrad     : list[float]  – axial stations for body radii
        rad      : list[float]  – body radii at those stations
    """
    with open(filepath, "r", encoding="utf-8") as fh:
        raw = fh.readlines()

    lines = [ln for ln in raw if ln.strip()]
    idx = 0

    # ── Header (Line type 1) ─────────────────────────────────────────────────
    first = lines[idx].split()
    nsect = int(first[0])
    idx += 1

    sections: list[dict[str, Any]] = []

    for i in range(nsect):
        # Line type 2: YSECT  G1SECT  G2SECT  HSECT
        parts = lines[idx].split()
        ysect, g1, g2, hsect = (float(parts[j]) for j in range(4))
        idx += 1

        # Line type 3: IMARK  MU  ML  XTWSEC  TWIST
        parts = lines[idx].split()
        imark = int(parts[0])
        mu = int(parts[1])
        ml = int(parts[2])
        xtwsec = float(parts[3])
        twist = float(parts[4])
        idx += 1

        if imark >= 0:
            # Read upper-surface coordinates
            us: list[tuple[float, float]] = []
            for _ in range(mu):
                p = lines[idx].split()
                us.append((float(p[0]), float(p[1])))
                idx += 1
            # Read lower-surface coordinates
            ls: list[tuple[float, float]] = []
            for _ in range(ml):
                p = lines[idx].split()
                ls.append((float(p[0]), float(p[1])))
                idx += 1
        else:
            # IMARK < 0 → inherit airfoil from previous section
            us = sections[i - 1]["US"][:]
            ls = sections[i - 1]["LS"][:]

        sections.append(
            {
                "YSECT": ysect,
                "G1SECT": g1,
                "G2SECT": g2,
                "HSECT": hsect,
                "IMARK": imark,
                "MU": mu,
                "ML": ml,
                "XTWSEC": xtwsec,
                "TWIST": twist,
                "US": us,
                "LS": ls,
            }
        )

    # ── Body data ─────────────────────────────────────────────────────────────
    nrad = 0
    xrad: list[float] = []
    rad: list[float] = []

    if idx < len(lines):
        body_parts = lines[idx].split()
        nrad = int(body_parts[0])
        idx += 1
        for _ in range(nrad):
            if idx >= len(lines):
                break
            p = lines[idx].split()
            xrad.append(float(p[0]))
            rad.append(float(p[1]))
            idx += 1

    return {"sections": sections, "nrad": nrad, "xrad": xrad, "rad": rad}


# ──────────────────────────────────────────────────────────────────────────────
# Planform parameter computation
# ──────────────────────────────────────────────────────────────────────────────

def _chord(s: dict) -> float:
    return s["G2SECT"] - s["G1SECT"]


def _group_consecutive_panels(sweeps: list[float], tolerance: float = 1.5):
    """
    Group consecutive panels whose sweep angles are within *tolerance*
    of the first panel in the group.

    Returns a list of dicts, each with:
        panels : list[int]  – panel indices in this group
        sweep  : float      – average sweep of the group
    """
    if not sweeps:
        return []

    groups: list[dict] = [{"panels": [0], "ref": sweeps[0]}]
    for i in range(1, len(sweeps)):
        if abs(sweeps[i] - groups[-1]["ref"]) <= tolerance:
            groups[-1]["panels"].append(i)
        else:
            groups.append({"panels": [i], "ref": sweeps[i]})

    for g in groups:
        g["sweep"] = sum(sweeps[p] for p in g["panels"]) / len(g["panels"])

    return groups


def compute_planform(sections: list[dict]) -> dict[str, Any]:
    """
    Derive the wing planform parameters that fpcon expects from section data.

    Returns a dict with:
        semi_span, root_chord, tip_chord, taper_ratio,
        aspect_ratio, sweep_le (deg),
        is_cranked, kink_index, kink_eta, kink_taper,
        sweep_le_1, sweep_le_2  (only when cranked),
        etas  (list of eta = YSECT / semi_span for each section)
    """
    root = sections[0]
    tip = sections[-1]

    semi_span = tip["YSECT"]
    root_chord = _chord(root)
    tip_chord = _chord(tip)
    taper_ratio = tip_chord / root_chord if root_chord else 0.0

    # Trapezoidal wing area (half-wing)
    s_half = 0.0
    for i in range(len(sections) - 1):
        dy = sections[i + 1]["YSECT"] - sections[i]["YSECT"]
        c_avg = (_chord(sections[i]) + _chord(sections[i + 1])) / 2.0
        s_half += c_avg * dy
    wing_area = 2.0 * s_half
    span = 2.0 * semi_span
    aspect_ratio = (span ** 2) / wing_area if wing_area else 0.0

    # Section etas
    etas = [s["YSECT"] / semi_span if semi_span else 0.0 for s in sections]

    # ── Detect cranked wing ───────────────────────────────────────────────────
    # Compute LE sweep per panel
    panel_sweeps: list[float] = []
    for i in range(len(sections) - 1):
        dy = sections[i + 1]["YSECT"] - sections[i]["YSECT"]
        dx = sections[i + 1]["G1SECT"] - sections[i]["G1SECT"]
        if abs(dy) > 1e-12:
            panel_sweeps.append(math.degrees(math.atan2(dx, dy)))
        else:
            panel_sweeps.append(0.0)

    # Compute TE sweep per panel
    te_sweeps: list[float] = []
    for i in range(len(sections) - 1):
        dy = sections[i + 1]["YSECT"] - sections[i]["YSECT"]
        dx = sections[i + 1]["G2SECT"] - sections[i]["G2SECT"]
        if abs(dy) > 1e-12:
            te_sweeps.append(math.degrees(math.atan2(dx, dy)))
        else:
            te_sweeps.append(0.0)

    # Overall LE sweep (root → tip)
    overall_sweep_le = math.degrees(
        math.atan2(tip["G1SECT"] - root["G1SECT"], semi_span)
    ) if semi_span else 0.0

    # Detect crank via consecutive-panel grouping.
    # A real crank produces two contiguous groups of >=2 panels with
    # internally consistent but mutually different sweep angles.
    # Body-wing junction effects produce isolated single-panel outliers
    # near the root that don't form a consistent group.
    is_cranked = False
    kink_index: int | None = None
    kink_eta = 0.0
    kink_taper = 0.0
    sweep_le_1 = overall_sweep_le
    sweep_le_2 = overall_sweep_le

    _GROUP_TOLERANCE = 1.5   # degrees – max intra-group sweep variation
    _MIN_GROUP_SIZE = 2      # panels needed for a "significant" group
    _SWEEP_DIFF_THRESH = 2.0 # degrees – min inter-group sweep difference

    if len(sections) >= 3:
        for sweeps in (panel_sweeps, te_sweeps):
            groups = _group_consecutive_panels(sweeps, _GROUP_TOLERANCE)
            sig = [g for g in groups if len(g["panels"]) >= _MIN_GROUP_SIZE]
            if len(sig) < 2:
                continue
            # Check adjacent significant groups for a real sweep break
            sig.sort(key=lambda g: min(g["panels"]))
            for j in range(len(sig) - 1):
                if abs(sig[j + 1]["sweep"] - sig[j]["sweep"]) > _SWEEP_DIFF_THRESH:
                    is_cranked = True
                    kink_index = max(sig[j]["panels"]) + 1  # section index
                    break
            if is_cranked:
                break

        if is_cranked and kink_index is not None:
            kink_eta = etas[kink_index]
            kink_taper = _chord(sections[kink_index]) / root_chord

            dy1 = sections[kink_index]["YSECT"] - root["YSECT"]
            dx1 = sections[kink_index]["G1SECT"] - root["G1SECT"]
            sweep_le_1 = math.degrees(math.atan2(dx1, dy1)) if dy1 else 0.0

            dy2 = tip["YSECT"] - sections[kink_index]["YSECT"]
            dx2 = tip["G1SECT"] - sections[kink_index]["G1SECT"]
            sweep_le_2 = math.degrees(math.atan2(dx2, dy2)) if dy2 else 0.0

    return {
        "semi_span": semi_span,
        "root_chord": root_chord,
        "tip_chord": tip_chord,
        "taper_ratio": taper_ratio,
        "aspect_ratio": aspect_ratio,
        "sweep_le": overall_sweep_le,
        "is_cranked": is_cranked,
        "kink_index": kink_index,
        "kink_eta": kink_eta,
        "kink_taper": kink_taper,
        "sweep_le_1": sweep_le_1,
        "sweep_le_2": sweep_le_2,
        "etas": etas,
        "panel_sweeps": panel_sweeps,
    }


# ──────────────────────────────────────────────────────────────────────────────
# .dat file creation
# ──────────────────────────────────────────────────────────────────────────────

def _is_symmetric(us: list[tuple[float, float]], ls: list[tuple[float, float]],
                  tol: float = 1e-4) -> bool:
    """Return True if the lower surface is the mirror of the upper surface."""
    if len(us) != len(ls):
        return False
    return all(
        abs(xu - xl) < tol and abs(zu + zl) < tol
        for (xu, zu), (xl, zl) in zip(us, ls)
    )


def create_dat_file(
    section: dict, title: str, filepath: str | Path
) -> None:
    """
    Write a ``.dat`` airfoil file from a GEO section's coordinate data.

    Format
    ------
    ::

        <title>
        IMARK  MU  ML  0.0  1.0
        <blank>
        <upper surface x z pairs>
        [<lower surface x z pairs>]   (only when IMARK == 0)
    """
    us = section["US"]
    ls = section["LS"]
    mu = len(us)
    ml = len(ls)
    symmetric = _is_symmetric(us, ls)
    imark = 1 if symmetric else 0

    with open(filepath, "w", encoding="utf-8") as fh:
        # Title
        fh.write(f" {title}\n")
        # Header:  IMARK  MU  ML  XTWSEC_default  chord_norm
        fh.write(f"    {imark}   {mu}   {ml}    .00000   1.00000\n")
        # Blank line
        fh.write("    \n")
        # Upper surface
        for x, z in us:
            fh.write(f"  {x:9.7f}  {z:9.7f}\n")
        # Lower surface (only for non-symmetric)
        if not symmetric:
            for x, z in ls:
                fh.write(f"  {x:9.7f}  {z:9.7f}\n")


def extract_dat_files(
    sections: list[dict], work_dir: Path, geo_name: str
) -> list[str]:
    """
    Create ``.dat`` files for each *unique* airfoil in the GEO sections.

    Sections with ``IMARK < 0`` inherit their airfoil from the previous
    section and are not written separately.

    Returns a list of .dat filenames (relative to *work_dir*), in span order.
    """
    dat_files: list[str] = []
    seen_indices: list[int] = []   # indices of sections that define new airfoils

    for i, sec in enumerate(sections):
        if sec["IMARK"] >= 0:
            seen_indices.append(i)

    if len(seen_indices) == 0:
        raise ValueError("No sections with airfoil data (IMARK >= 0) found in GEO file.")

    # Check if all unique sections share the same coordinates
    first_us = sections[seen_indices[0]]["US"]
    first_ls = sections[seen_indices[0]]["LS"]
    all_same = all(
        sections[j]["US"] == first_us and sections[j]["LS"] == first_ls
        for j in seen_indices
    )

    if all_same:
        # Single airfoil file – use 8.3 naming for Fortran compatibility
        fname = f"afsec00.dat"
        title = f"{geo_name} airfoil ({len(first_us)} upper + {len(first_ls)} lower coords)"
        create_dat_file(sections[seen_indices[0]], title, work_dir / fname)
        dat_files.append(fname)
    else:
        # One file per unique airfoil – 8.3 naming
        for k, idx in enumerate(seen_indices):
            sec = sections[idx]
            fname = f"afsec{k:02d}.dat"
            title = (
                f"{geo_name} section {idx} "
                f"({len(sec['US'])} upper + {len(sec['LS'])} lower coords)"
            )
            create_dat_file(sec, title, work_dir / fname)
            dat_files.append(fname)

    return dat_files


# ──────────────────────────────────────────────────────────────────────────────
# EXIN1.DAT builder
# ──────────────────────────────────────────────────────────────────────────────

def build_exin1(
    planform: dict,
    sections: list[dict],
    dat_files: list[str],
    *,
    title: str = "GEO-derived run",
    mach: float = 0.0,
    incidence: float = 0.0,
    clcd_conv: str = "n",
    body_radius: float = 0.0,
    filepath: str | Path = "EXIN1.DAT",
) -> None:
    """Build the ``EXIN1.DAT`` input file consumed by ``fpcon``."""
    is_cranked = planform["is_cranked"]
    nsect = len(sections)
    etas = planform["etas"]

    # Determine nchange (number of airfoil changes along span)
    # Identify unique-airfoil section indices
    unique_indices = [i for i, s in enumerate(sections) if s["IMARK"] >= 0]
    # Do all unique sections share the same airfoil?
    first_us = sections[unique_indices[0]]["US"]
    first_ls = sections[unique_indices[0]]["LS"]
    all_same = all(
        sections[j]["US"] == first_us and sections[j]["LS"] == first_ls
        for j in unique_indices
    )
    airfoil_changes = 0 if all_same else len(unique_indices) - 1

    with open(filepath, "w", encoding="utf-8") as fh:
        # Line 1: planform type flag
        if is_cranked:
            fh.write("y\n")
        else:
            fh.write("n\n")

        # Line 2: AR  (+ optional TR_kink, eta_kink for cranked)
        if is_cranked:
            fh.write(
                f"   {planform['aspect_ratio']:.6f}"
                f"      {planform['taper_ratio']:.7f}"
                f"      {planform['kink_taper']:.7f}"
                f"      {planform['kink_eta']:.7f}\n"
            )
        else:
            fh.write(
                f"   {planform['aspect_ratio']:.6f}"
                f"      {planform['taper_ratio']:.7f}\n"
            )

        # Line 3: sweep angle(s)
        if is_cranked:
            fh.write(
                f"   {planform['sweep_le_1']:.5f}"
                f"       {planform['sweep_le_2']:.5f}\n"
            )
        else:
            fh.write(f"   {planform['sweep_le']:.5f}\n")

        # Line 4: nsect
        fh.write(f"           {nsect}\n")

        # Line 5: NSECT1 (kink section, 1-based) for cranked, or nchange for simple
        if is_cranked:
            # NSECT1 = 1-based index of the crank/kink section
            nsect1 = planform["kink_index"] + 1
            fh.write(f"           {nsect1}\n")
            # NCHANGE (airfoil changes)
            fh.write(f"           {airfoil_changes}\n")
        else:
            nchange = airfoil_changes
            fh.write(f"           {nchange}\n")

        # Change-section lines
        # For cranked wings, fpcon expects the airfoil-change count after nchange
        # When there are actual airfoil changes, list the section indices
        if airfoil_changes > 0:
            for j in unique_indices[1:]:
                # 1-based section index for Fortran
                fh.write(f"           {j + 1}\n")

        # Airfoil file(s)
        for fname in dat_files:
            fh.write(f"{fname}\n")

        # Section data: eta  hsect  xtwsec  twist
        for i, sec in enumerate(sections):
            fh.write(
                f"  {etas[i]:.7f}"
                f"      {sec['HSECT']:.7f}"
                f"      {sec['XTWSEC']:.7f}"
                f"      {sec['TWIST']:.7f}\n"
            )

        # Body radius
        fh.write(f"  {body_radius:.7f}\n")

        # Title (padded to 72 chars for fixed-format Fortran read)
        fh.write(f"{title:<72s}\n")

        # CL/CD convergence flag
        fh.write(f"{clcd_conv}\n")

        # Mach number and incidence
        fh.write(f"  {mach:.7f}      {incidence:.7f}\n")


# ──────────────────────────────────────────────────────────────────────────────
# fpcon runner
# ──────────────────────────────────────────────────────────────────────────────

def find_fpcon_dir() -> Path:
    """Locate the fpcon tools directory relative to this script."""
    # Try: <this_script>/fpcon/
    here = Path(__file__).resolve().parent
    candidates = [
        here / "fpcon",
        here.parent / "tools" / "fpcon",
        here / ".." / "fpcon",
    ]
    for c in candidates:
        if (c / "fpcon.exe").exists():
            return c.resolve()
    raise FileNotFoundError(
        "Cannot find fpcon.exe.  Use --fpcon-dir to specify its location."
    )


def run_fpcon(work_dir: Path, fpcon_dir: Path, timeout: int = 60) -> None:
    """
    Copy fpcon tool binaries into *work_dir* and run ``fpcon < EXIN1.DAT``.
    """
    # Copy all tool files
    for item in fpcon_dir.iterdir():
        if item.is_file():
            dest = work_dir / item.name
            if not dest.exists():
                shutil.copy2(str(item), str(dest))

    exin_path = work_dir / "EXIN1.DAT"
    if not exin_path.exists():
        raise FileNotFoundError(f"EXIN1.DAT not found in {work_dir}")

    print(f"  Running fpcon in {work_dir} ...")
    try:
        result = subprocess.run(
            ["cmd.exe", "/c", "fpcon < EXIN1.DAT"],
            cwd=str(work_dir),
            check=True,
            timeout=timeout,
            capture_output=True,
            text=True,
        )
        if result.stdout:
            print(f"  fpcon stdout:\n{result.stdout}")
    except subprocess.CalledProcessError as exc:
        print(f"  fpcon FAILED (exit code {exc.returncode})", file=sys.stderr)
        if exc.stderr:
            print(f"  stderr: {exc.stderr}", file=sys.stderr)
        raise
    except subprocess.TimeoutExpired:
        print(f"  fpcon timed out after {timeout}s", file=sys.stderr)
        raise


# ──────────────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Generate MAP and FLOW files from an existing VFP .GEO file "
            "by reverse-engineering planform parameters and running fpcon."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("geo_file", help="Path to the input .GEO file")
    parser.add_argument(
        "--mach", type=float, default=0.0,
        help="Mach number (default: 0.0)",
    )
    parser.add_argument(
        "--incidence", type=float, default=0.0,
        help="Incidence angle in degrees (default: 0.0)",
    )
    parser.add_argument(
        "--title", default=None,
        help="Run title (default: derived from GEO filename)",
    )
    parser.add_argument(
        "-o", "--output-dir", default=None,
        help="Output directory for MAP and FLOW files (default: alongside GEO file)",
    )
    parser.add_argument(
        "--fpcon-dir", default=None,
        help="Directory containing fpcon.exe and associated tools",
    )
    parser.add_argument(
        "--clcd-conv", choices=["y", "n"], default="n",
        help="CL/CD convergence correction flag (default: n)",
    )
    parser.add_argument(
        "--keep-workdir", action="store_true",
        help="Do not delete the temporary working directory after completion",
    )
    args = parser.parse_args()

    geo_path = Path(args.geo_file).resolve()
    if not geo_path.exists():
        print(f"Error: GEO file not found: {geo_path}", file=sys.stderr)
        sys.exit(1)

    geo_name = geo_path.stem
    title = args.title or geo_name

    output_dir = Path(args.output_dir).resolve() if args.output_dir else geo_path.parent
    output_dir.mkdir(parents=True, exist_ok=True)

    if args.fpcon_dir:
        fpcon_dir = Path(args.fpcon_dir).resolve()
    else:
        fpcon_dir = find_fpcon_dir()
    if not (fpcon_dir / "fpcon.exe").exists():
        print(f"Error: fpcon.exe not found in {fpcon_dir}", file=sys.stderr)
        sys.exit(1)

    # ── Step 1: parse GEO ─────────────────────────────────────────────────────
    print(f"[1/5] Parsing GEO file: {geo_path}")
    geo_data = parse_geo(geo_path)
    sections = geo_data["sections"]
    print(f"      Found {len(sections)} sections")

    # ── Step 2: compute planform ──────────────────────────────────────────────
    print("[2/5] Computing planform parameters ...")
    planform = compute_planform(sections)

    print(f"      Semi-span     = {planform['semi_span']:.6f}")
    print(f"      Root chord    = {planform['root_chord']:.6f}")
    print(f"      Tip chord     = {planform['tip_chord']:.6f}")
    print(f"      Taper ratio   = {planform['taper_ratio']:.6f}")
    print(f"      Aspect ratio  = {planform['aspect_ratio']:.6f}")
    if planform["is_cranked"]:
        print(f"      Planform type = CRANKED (kink at eta = {planform['kink_eta']:.4f})")
        print(f"      Sweep LE (inner) = {planform['sweep_le_1']:.4f} deg")
        print(f"      Sweep LE (outer) = {planform['sweep_le_2']:.4f} deg")
        print(f"      Kink taper ratio = {planform['kink_taper']:.6f}")
    else:
        print(f"      Planform type = SIMPLE straight-tapered")
        print(f"      Sweep LE      = {planform['sweep_le']:.4f} deg")
    print(f"      Etas = {[f'{e:.4f}' for e in planform['etas']]}")

    # Body radius
    body_radius = 0.0
    if geo_data["nrad"] > 0 and geo_data["rad"]:
        body_radius = sum(geo_data["rad"]) / len(geo_data["rad"])
        print(f"      Body radius   = {body_radius:.6f}")

    # ── Step 3: create working dir & .dat files ───────────────────────────────
    work_dir = Path(tempfile.mkdtemp(prefix="geo2fpcon_"))
    print(f"[3/5] Extracting airfoil .dat files → {work_dir}")

    dat_files = extract_dat_files(sections, work_dir, geo_name)
    for df in dat_files:
        print(f"      Created {df}")

    # ── Step 4: build EXIN1.DAT ───────────────────────────────────────────────
    exin1_path = work_dir / "EXIN1.DAT"
    print(f"[4/5] Building EXIN1.DAT")
    build_exin1(
        planform,
        sections,
        dat_files,
        title=title,
        mach=args.mach,
        incidence=args.incidence,
        clcd_conv=args.clcd_conv,
        body_radius=body_radius,
        filepath=exin1_path,
    )

    # Show the generated EXIN1.DAT for debugging
    print("      ┌─ EXIN1.DAT ──────────────────────────")
    with open(exin1_path, "r") as fh:
        for line in fh:
            print(f"      │ {line}", end="")
    print("      └─────────────────────────────────────────")

    # ── Step 5: run fpcon ─────────────────────────────────────────────────────
    print("[5/5] Running fpcon ...")
    run_fpcon(work_dir, fpcon_dir)

    # ── Collect output files ──────────────────────────────────────────────────
    geo_out = work_dir / "GEO.DAT"
    map_out = work_dir / "MAP.DAT"
    flow_out = work_dir / "FLOW.DAT"
    geosup_out = work_dir / "GEOSUP.DAT"
    respin_out = work_dir / "RESPIN.DAT"

    collected: list[str] = []
    for src, dest_name in [
        (map_out,    f"{geo_name}.MAP"),
        (flow_out,   f"FLOW.DAT"),
        (geosup_out, f"GEOSUP.DAT"),
        (respin_out, f"RESPIN.DAT"),
    ]:
        if src.exists():
            dest = output_dir / dest_name
            shutil.copy2(str(src), str(dest))
            collected.append(dest_name)

    # Also copy the regenerated GEO for comparison (useful for validation)
    if geo_out.exists():
        dest = output_dir / f"{geo_name}_fpcon.GEO"
        shutil.copy2(str(geo_out), str(dest))
        collected.append(f"{geo_name}_fpcon.GEO")

    if not args.keep_workdir:
        shutil.rmtree(work_dir, ignore_errors=True)
    else:
        print(f"  Working directory preserved: {work_dir}")

    print()
    if collected:
        print("Done!  Output files:")
        for fn in collected:
            print(f"  → {output_dir / fn}")
    else:
        print("WARNING: No output files were produced by fpcon.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

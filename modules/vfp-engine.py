import os
import json
import shutil
import subprocess
import base64
import re
import numpy as np

from vfp_processing.downwashLLT import compute_downwash_LLT
from vfp_processing.readVFP import readFLOW
from utils.VFP_File_Generation_Utils import extract_levels_and_fuse
from utils import VFP_Data_Extraction_Utils as vfp_extract

# --- CONFIGURATION ---
# vfpFilePath = r"C:\Users\Tarun.Ramprakash\Downloads\CRM-Wing-3.vfp"

import sys

if len(sys.argv) > 1:
    vfpFilePath = sys.argv[1]
else:
    raise RuntimeError("Usage: python vfp-engine.py <vfpFilePath>")

# --- UTILITY FUNCTIONS ---

def write_vfp_input_files(vfp_data, config_key, base_dir):
    input_files = vfp_data.get("inputFiles", {})
    config = input_files.get(config_key, {})
    file_names = config.get("fileNames", {})
    file_data = config.get("fileData", {})
    for key, file_name in file_names.items():
        if file_name and file_name in file_data:
            data = file_data[file_name].rstrip('\r\n')
            file_path = os.path.join(base_dir, file_name)
            os.makedirs(os.path.dirname(file_path), exist_ok=True)
            with open(file_path, "w", encoding="utf-8", newline='') as f:
                f.write(data)
            print(f"Wrote {file_path}")

def copy_simulation_files(src_dir, dest_dir):
    if not os.path.exists(src_dir):
        print(f"Source directory {src_dir} does not exist.")
        return
    os.makedirs(dest_dir, exist_ok=True)
    for file_name in os.listdir(src_dir):
        src_file = os.path.join(src_dir, file_name)
        dest_file = os.path.join(dest_dir, file_name)
        if os.path.isfile(src_file):
            shutil.copy2(src_file, dest_file)
            print(f"Copied {src_file} to {dest_file}")

def add_vfp_results_to_data(vfp_data, sim_dir, config_key):
    """
    Adds result files for the current simulation to vfp_data, avoiding duplicates and only storing .mapout once.
    Each simulation's results are keyed by [flowFileName][result_file_name].
    Also adds wavedrag files: {geoFileName}{flowFileName}+wavedrg73/74/75/76.DAT
    """
    import base64

    result_exts = [
        ".mapout", ".cp", ".flow", ".conv", ".forces", ".sum", ".vis", ".DAT"
    ]
    dump_exts = {".fort11", ".fort15", ".fort21", ".fort50", ".fort51", ".fort52", ".fort55"}
    wavedrag_suffixes = [f"wavedrg{n}.DAT" for n in range(73, 77)]

    file_names = vfp_data["inputFiles"][config_key]["fileNames"]
    geo_file = os.path.splitext(file_names["GeoFile"])[0]
    flow_file = file_names["DatFile"]
    flow_file_no_ext = os.path.splitext(flow_file)[0]
    flow_key = flow_file_no_ext  # use flow key without extension for results indexing

    # Prepare results dict
    if "results" not in vfp_data:
        vfp_data["results"] = {}
    if config_key not in vfp_data["results"]:
        vfp_data["results"][config_key] = {}
    if flow_key not in vfp_data["results"][config_key]:
        vfp_data["results"][config_key][flow_key] = {}

    results = vfp_data["results"][config_key][flow_key]

    # Track if .mapout has already been stored for this config
    mapout_written = False
    for sim_results in vfp_data["results"][config_key].values():
        if any(fname.lower().endswith('.mapout') for fname in sim_results):
            mapout_written = True
            break

    # Standard result files
    for ext in result_exts:
        if ext == ".mapout":
            fname = f"{geo_file}{ext}"
            fpath = os.path.join(sim_dir, fname)
            if os.path.isfile(fpath) and not mapout_written:
                try:
                    with open(fpath, "r", encoding="utf-8") as f:
                        data = f.read()
                    results[fname] = {"data": data, "encoding": "utf-8"}
                except Exception:
                    with open(fpath, "rb") as f:
                        bdata = f.read()
                    b64data = base64.b64encode(bdata).decode("ascii")
                    results[fname] = {"data": b64data, "encoding": "base64"}
                mapout_written = True
            continue

        # Dump files are stored under a dedicated dumpFiles node
        if ext in dump_exts:
            fname = f"{geo_file}{flow_file_no_ext}{ext}"
            fpath = os.path.join(sim_dir, fname)
            if os.path.isfile(fpath):
                dump_files = results.setdefault("dumpFiles", {})
                if fname not in dump_files:
                    try:
                        with open(fpath, "r", encoding="utf-8") as f:
                            data = f.read()
                        dump_files[fname] = {"data": data, "encoding": "utf-8"}
                    except Exception:
                        with open(fpath, "rb") as f:
                            bdata = f.read()
                        b64data = base64.b64encode(bdata).decode("ascii")
                        dump_files[fname] = {"data": b64data, "encoding": "base64"}
            continue

        fname = f"{geo_file}{flow_file_no_ext}{ext}"
        fpath = os.path.join(sim_dir, fname)
        if os.path.isfile(fpath):
            if fname not in results:
                try:
                    with open(fpath, "r", encoding="utf-8") as f:
                        data = f.read()
                    results[fname] = {"data": data, "encoding": "utf-8"}
                except Exception:
                    with open(fpath, "rb") as f:
                        bdata = f.read()
                    b64data = base64.b64encode(bdata).decode("ascii")
                    results[fname] = {"data": b64data, "encoding": "base64"}

    # Wavedrag result files
    for suffix in wavedrag_suffixes:
        fname = f"{geo_file}{flow_file_no_ext}{suffix}"
        fpath = os.path.join(sim_dir, fname)
        if os.path.isfile(fpath):
            if fname not in results:
                try:
                    with open(fpath, "r", encoding="utf-8") as f:
                        data = f.read()
                    results[fname] = {"data": data, "encoding": "utf-8"}
                    print(f"Added wavedrag file to results: {fname}")
                except Exception:
                    with open(fpath, "rb") as f:
                        bdata = f.read()
                    b64data = base64.b64encode(bdata).decode("ascii")
                    results[fname] = {"data": b64data, "encoding": "base64"}

    print(f"Added {len(results)} result files to vfp_data['results']['{config_key}']['{flow_file}']")
    return vfp_data


def extract_polars(sim_dir):
    """Build polar arrays from .forces and wavedrag files in a simulation directory."""
    forces_paths = [
        os.path.join(sim_dir, fname)
        for fname in os.listdir(sim_dir)
        if fname.lower().endswith(".forces")
    ]
    wavedrag_paths = [
        os.path.join(sim_dir, fname)
        for fname in os.listdir(sim_dir)
        if "wavedrg73" in fname.lower()
    ]

    forces_by_aoa = {}
    for fpath in forces_paths:
        aoa = vfp_extract.extract_aoa_from_forces_filename(fpath)
        if aoa is not None:
            forces_by_aoa[aoa] = fpath

    wavedrag_by_aoa = {}
    for wpath in wavedrag_paths:
        aoa = vfp_extract.extract_aoa_from_filename(wpath)
        if aoa is not None:
            wavedrag_by_aoa[aoa] = wpath

    common_aoas = sorted(set(forces_by_aoa.keys()) & set(wavedrag_by_aoa.keys()))
    if not common_aoas:
        print("No matching .forces and wavedrag files found for polars extraction.")
        return {}

    records = []
    for aoa in common_aoas:
        fpath = forces_by_aoa[aoa]
        wpath = wavedrag_by_aoa[aoa]
        record = vfp_extract.extract_data(fpath, wpath)
        records.append(record)

    # Sort by ALPHA to keep polars ordered
    def _alpha_or_inf(rec):
        val = rec.get("ALPHA")
        return val if val is not None else float("inf")

    records = sorted(records, key=_alpha_or_inf)

    polar_keys = [
        "ALPHA",
        "MACH NO",
        "CL",
        "Cdv",
        "Cdi",
        "CDtotVFP",
        "CDtotIBE",
        "CMTOT(VFP)",
        "CDW_Upper",
        "CDW_Lower",
        "CDW(tot)",
    ]

    polars = {key: [] for key in polar_keys}
    polars["Filename"] = []

    for rec in records:
        for key in polar_keys:
            polars[key].append(rec.get(key))
        polars["Filename"].append(rec.get("Filename"))

    print(f"Extracted polars for {len(records)} points from {sim_dir}")
    return polars


def run_vfp(sim_dir, vfp_data, config_key):
    bat_path = os.path.join(sim_dir, "cmdvfp.bat")
    files = vfp_data["inputFiles"][config_key]["fileNames"]
    geoName = os.path.splitext(files["GeoFile"])[0]
    mapName = os.path.splitext(files["MapFile"])[0]
    datName = os.path.splitext(files["DatFile"])[0]
    continuation = vfp_data["formData"].get("continuationRun", False)
    excrescence = vfp_data["formData"].get("excrescence", False)
    cont_flag = "y" if continuation else "n"
    excr_flag = "y" if excrescence else "n"
    args = [bat_path, mapName, geoName, datName, cont_flag, excr_flag, ""]
    process = subprocess.Popen(
        args,
        cwd=sim_dir,
        shell=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True
    )
    for line in process.stdout:
        print(line, end="")
    process.wait()
    print(f"VFP run completed with exit code {process.returncode}")
    add_vfp_results_to_data(vfp_data, sim_dir, config_key)
    print(f"Simulation results added to VFP Data for {config_key}.")
    return vfp_data

def vfp_dumpfile_write(sim_dir, vfp_data, config_key, dumpFileName):
    required_exts = [".fort11", ".fort15", ".fort21", ".fort50", ".fort51", ".fort52", ".fort55"]
    results_root = vfp_data.get("results")
    if results_root is None or config_key not in results_root:
        available = list(results_root.keys()) if results_root else []
        raise ValueError(f"No results found for {config_key} in vfp_data. Available result configs: {available}")

    results_dict = results_root[config_key]
    if not results_dict:
        raise ValueError(f"Results for {config_key} are empty; flow keys available: {list(results_root.keys())}")

    if dumpFileName not in results_dict:
        raise FileNotFoundError(
            f"Flow key '{dumpFileName}' not found in results for {config_key}. "
            f"Available flow keys: {list(results_dict.keys())}"
        )

    print(f"Using flow key '{dumpFileName}' for dump write.")
    results = results_dict[dumpFileName]

    for ext in required_exts:
        # Find the first file in this flow entry that ends with the required extension
        matching_names = [name for name in results if name.lower().endswith(ext)]
        if not matching_names:
            raise FileNotFoundError(
                f"Required dump file with extension {ext} not found under flow key '{dumpFileName}'."
            )
        fname = matching_names[0]
        file_info = results[fname]
        data = file_info["data"]
        encoding = file_info.get("encoding", "utf-8")
        file_path = os.path.join(sim_dir, fname)
        if encoding == "base64":
            with open(file_path, "wb") as f:
                f.write(base64.b64decode(data))
            print(f"Wrote binary dump file: {file_path}")
        else:
            with open(file_path, "w", encoding="utf-8", newline='') as f:
                f.write(data)
            print(f"Wrote dump file: {file_path}")

def run_vfp_continuation(sim_dir, vfp_data, config_key, dumpFileName):
    vfp_dumpfile_write(sim_dir, vfp_data, config_key, dumpFileName)
    bat_path = os.path.join(sim_dir, "cmdvfp.bat")
    files = vfp_data["inputFiles"][config_key]["fileNames"]
    geoName = os.path.splitext(files["GeoFile"])[0]
    mapName = os.path.splitext(files["MapFile"])[0]
    datName = os.path.splitext(files["DatFile"])[0]
    continuation = vfp_data["formData"].get("continuationRun", False)
    excrescence = vfp_data["formData"].get("excrescence", False)
    cont_flag = "y" if continuation else "n"
    excr_flag = "y" if excrescence else "n"
    dump_base = geoName + os.path.splitext(dumpFileName)[0]
    args = [bat_path, mapName, geoName, datName, excr_flag, cont_flag, dump_base, ""]
    print(f"Running VFP continuation with args: {args}")
    process = subprocess.Popen(
        args,
        cwd=sim_dir,
        shell=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True
    )
    for line in process.stdout:
        print(line, end="")
    process.wait()
    print(f"VFP continuation run completed with exit code {process.returncode}")
    add_vfp_results_to_data(vfp_data, sim_dir, config_key)
    print(f"Simulation results added to VFP Data for {config_key}.")
    return vfp_data

def extract_alpha_mach_from_flow(flow_file, level_idx=1):
    result = readFLOW(flow_file)
    level_key = f"level{level_idx}"
    first_line = result['levels'][level_key][0]
    parts = first_line.split()
    mach = float(parts[3])
    alpha = float(parts[4])
    return alpha, mach

def modify_tail_flow_file_preserve_format(tail_flow, new_aoa, new_mach):
    with open(tail_flow, 'r') as f:
        lines = f.readlines()
    data_json = extract_levels_and_fuse(lines)
    new_mach_str = f"{float(new_mach):.4f}"
    new_aoa_str = f"{float(new_aoa):.4f}"
    for key in data_json:
        if key.startswith('level'):
            block = data_json[key]
            first_line = block[0]
            pattern = re.compile(
                r'(^\s*2\s+\S+\s+\d+\s+)'  # Prefix up to Mach
                r'([-+]?\d+\.\d+)(\s+)'    # Mach number
                r'([-+]?\d+\.\d+)(\s+)'    # AoA
            )
            def repl(m):
                return m.group(1) + new_mach_str + m.group(3) + new_aoa_str + m.group(5)
            block[0] = pattern.sub(repl, first_line, count=1)
            data_json[key] = block
    new_lines = []
    new_lines.append(lines[0])
    new_lines.append(lines[1])
    idx = 2
    if 'fuse' in data_json:
        fuse_lines = data_json['fuse']
        new_lines.extend(fuse_lines)
        idx += len(fuse_lines)
    level_idx = 1
    while idx < len(lines):
        line = lines[idx]
        if line.lstrip().startswith('2') and f'level{level_idx}' in data_json:
            new_lines.extend(data_json[f'level{level_idx}'])
            idx += len(data_json[f'level{level_idx}'])
            level_idx += 1
        else:
            new_lines.append(line)
            idx += 1
    with open(tail_flow, 'w') as f:
        f.writelines(new_lines)
    print(f"Modified tail flow file written to: {tail_flow} (format preserved)")

def _json_safe_default(obj):
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    if isinstance(obj, (np.floating, np.integer, np.bool_)):
        return obj.item()
    return str(obj)


def save_vfp_results(vfp_data, simName, aoa, project_root):
    if aoa is not None:
        aoa_str = f"{float(aoa):.2f}".replace('.', 'p').replace('-', 'm')
        result_filename = f"{simName}-a{aoa_str}.vfp"
    else:
        result_filename = f"{simName}_results.vfp"
    outputVfpPath = os.path.join(project_root, "data", "Simulations", result_filename)
    with open(outputVfpPath, "w", encoding="utf-8") as f:
        json.dump(vfp_data, f, indent=4, default=_json_safe_default)
    print(f"Saved updated VFP data with results to {outputVfpPath}")

def cleanup_sim_dir(sim_dir):
    try:
        shutil.rmtree(sim_dir)
        print(f"Deleted simulation working directory: {sim_dir}")
    except Exception as e:
        print(f"Failed to delete simulation working directory: {e}")


def generate_flow_file(base_flow_path, new_flow_path, new_aoa=None, new_mach=None):
    """
    Generate a new flow file with:
    1. Title line (file name)
    2. '    n' where n is the number of fuse lines (or 0)
    3. Fuse lines (if any)
    4. Level 1 lines (with modified Mach/AoA and second field's first char, preserving format)
    5. End with '    0'
    """
    import re
    result = readFLOW(base_flow_path)
    levels_dict = result.get('levels', {})
    level_numbers = [int(m.group(1)) for key in levels_dict for m in re.finditer(r'^level(\d+)$', key)]
    if not level_numbers:
        raise ValueError("No level blocks found in flow file.")
    highest_level_key = f"level{max(level_numbers)}"
    level1_lines = levels_dict[highest_level_key][:]
    fuse_lines = result.get('fuse', None)
    # Modify the first line of level 1
    first_line = level1_lines[0]
    parts = first_line.split()
    if len(parts) < 5:
        raise ValueError("Unexpected format in flow file's level 1 first line.")
    # Modify Mach and AoA if needed
    if new_mach is not None:
        parts[3] = f"{float(new_mach):.4f}"
    if new_aoa is not None:
        parts[4] = f"{float(new_aoa):.4f}"
    # Change the first character of the second part to '1'
    if len(parts[1]) > 0:
        parts[1] = '1' + parts[1][1:]
    # Rebuild the first line, preserving original spacing
    def replace_nth_field(line, n, new_value):
        fields = list(re.finditer(r'\S+', line))
        if len(fields) > n:
            start, end = fields[n].span()
            return line[:start] + new_value + line[end:]
        return line
    mod_line = first_line
    mod_line = replace_nth_field(mod_line, 3, parts[3])
    mod_line = replace_nth_field(mod_line, 4, parts[4])
    # Replace the second field's first character
    fields = list(re.finditer(r'\S+', mod_line))
    if len(fields) > 1:
        start, end = fields[1].span()
        orig = mod_line[start:end]
        mod = '1' + orig[1:]
        mod_line = mod_line[:start] + mod + mod_line[end:]
    level1_lines[0] = mod_line

    with open(new_flow_path, "w", newline='') as f:
        # 1. Title line (file name)
        f.write("Flow File" + "\r\n")
        # 2. '    n' where n is the number of fuse lines (or 0)
        n_fuse = len(fuse_lines) if fuse_lines else 0
        f.write(f"   {n_fuse}\r\n")
        # 3. Fuse lines (if any)
        if fuse_lines and n_fuse > 0:
            for fuse_line in fuse_lines:
                f.write(fuse_line+"\n")
        # 4. Level 1 lines
        for line in level1_lines:
            f.write(line+"\n")
        # 5. End with '    0'
        f.write("    0\r\n")
    print(f"Generated flow file (level 1 only, format preserved): {new_flow_path}")


def get_flow_filename(mach, aoa):
    mach_str = f"{mach:.2f}".replace('.', '')
    aoa_sign = '+' if aoa >= 0 else '-'
    aoa_str = f"{abs(aoa):.2f}".replace('.', 'p')
    return f"M{mach_str}ma{aoa_sign}{aoa_str}.DAT"

# --- MAIN WORKFLOW ---

with open(vfpFilePath, "r", encoding="utf-8") as f:
    vfpData = json.load(f)

simName = vfpData["formData"]["simName"]
print(f"Loaded VFP Case: {simName}")

project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
simBaseDir = os.path.join(project_root, "data", "Simulations", simName)
wingSimDir = os.path.join(simBaseDir, "wing")
tailSimDir = os.path.join(simBaseDir, "tail")
os.makedirs(wingSimDir, exist_ok=True)
os.makedirs(tailSimDir, exist_ok=True)

vfp_dir = os.path.join(project_root, "modules", "utils")
copy_simulation_files(vfp_dir, wingSimDir)
copy_simulation_files(vfp_dir, tailSimDir)
print("Simulation files copied.")

if "wingConfig" in vfpData.get("inputFiles", {}):
    write_vfp_input_files(vfpData, "wingConfig", base_dir=wingSimDir)
if "tailConfig" in vfpData.get("inputFiles", {}):
    write_vfp_input_files(vfpData, "tailConfig", base_dir=tailSimDir)
print("All input files written.")

aoa = vfpData["formData"].get("aoa", None)
continuation = vfpData["formData"].get("continuationRun", False)
auto_runner = vfpData["formData"].get("autoRunner", False)

# --- Write tailSpec file if present in bodyFiles ---
tail_spec = None
if "bodyFiles" in vfpData["inputFiles"]:
    body_files = vfpData["inputFiles"]["bodyFiles"]
    if "fileNames" in body_files and "fileData" in body_files:
        for fname, fdata in body_files["fileData"].items():
            tail_spec_path = os.path.join(tailSimDir, fname)
            with open(tail_spec_path, "w", encoding="utf-8") as f:
                f.write(fdata)
            print(f"Wrote tail spec file: {tail_spec_path}")
            tail_spec = tail_spec_path  # Use the first one found

# --- MODE SELECTION AND EXECUTION ---
if auto_runner:
    print("AutoRunner mode enabled.")
    autoMode = vfpData["formData"].get("autoMode", "aoa")  # "aoa" or "mach"
    autoStepSize = float(vfpData["formData"].get("autoStepSize", 1.0))
    autoEndValue = float(vfpData["formData"].get("autoEndAoA", 0.0)) if autoMode == "aoa" else float(vfpData["formData"].get("autoEndMach", 0.0))
    base_aoa = float(vfpData["formData"].get("aoa", 0.0))
    base_mach = float(vfpData["formData"].get("mach", 0.0))
    # Extract Reynolds number and other parts from the original flow file name
    orig_flow_file_name = vfpData["inputFiles"]["wingConfig"]["fileNames"]["DatFile"]
    re_match = re.search(r"Re(\d+p\d+)", orig_flow_file_name)
    reynolds = re_match.group(1) if re_match else "0p00"
    mach_match = re.search(r"M(\d+)", orig_flow_file_name)
    mach_str = mach_match.group(1) if mach_match else "000"
    # Number of simulations
    n = int(((autoEndValue - base_aoa) if autoMode == "aoa" else (autoEndValue - base_mach)) / autoStepSize) + 1
    values = [base_aoa + i * autoStepSize if autoMode == "aoa" else base_mach + i * autoStepSize for i in range(n)]
    # First simulation (non-continuation) - use the user-provided flow file as-is
    print(f"AutoRunner: Running first simulation at {autoMode}={values[0]}")
    flow_file_name = orig_flow_file_name
    vfpData["inputFiles"]["wingConfig"]["fileNames"]["DatFile"] = flow_file_name
    vfpData = run_vfp(wingSimDir, vfpData, "wingConfig")
    vfpData = add_vfp_results_to_data(vfpData, wingSimDir, "wingConfig")
    base_flow_path = os.path.join(wingSimDir, flow_file_name)
    # Subsequent simulations (continuation)
    for i in range(1, n):
        print(f"AutoRunner: Running continuation simulation {i+1}/{n} at {autoMode}={values[i]}")
        # Generate new flow file name
        if autoMode == "aoa":
            mach_val = base_mach
            aoa_val = values[i]
        else:
            mach_val = values[i]
            aoa_val = base_aoa
        mach_part = f"M{mach_val:.2f}".replace('.', '')
        aoa_str = f"{abs(aoa_val):05.2f}".replace('.', 'p')  # Always two digits after decimal
        flow_file_name = f"{mach_part}Re{reynolds}ma{'+' if aoa_val >= 0 else '-'}{aoa_str}.DAT"

        flow_file_path = os.path.join(wingSimDir, flow_file_name)
        generate_flow_file(base_flow_path, flow_file_path, new_aoa=aoa_val if autoMode == "aoa" else base_aoa, new_mach=mach_val if autoMode == "mach" else base_mach)
        vfpData["inputFiles"]["wingConfig"]["fileNames"]["DatFile"] = flow_file_name
        # For continuation runs, the dumpFileName is the prior flow key in results (DatFile name)
        if i == 1:
            dumpFileName = orig_flow_file_name
        else:
            prev_aoa_str = f"{abs(values[i-1]):05.2f}".replace('.', 'p') if autoMode == "aoa" else f"{abs(base_aoa):05.2f}".replace('.', 'p')
            pre_mach_part = f"M{base_mach:.2f}".replace('.', '') if autoMode == "aoa" else f"M{values[i-1]:.2f}".replace('.', '')
            prev_flow_file_name = f"{pre_mach_part}Re{reynolds}ma{'+' if values[i-1] >= 0 else '-'}{prev_aoa_str}.DAT"
            dumpFileName = prev_flow_file_name
        vfpData["formData"]["continuationRun"] = True
        vfpData = run_vfp_continuation(wingSimDir, vfpData, "wingConfig", dumpFileName)
        vfpData = add_vfp_results_to_data(vfpData, wingSimDir, "wingConfig")
    # Extract polars (AutoRunner only) and save results after all runs
    polars_data = extract_polars(wingSimDir)
    if polars_data:
        vfpData.setdefault("results", {})["Polars"] = polars_data
    else:
        print("No polars were extracted; results->Polars not updated.")

    save_vfp_results(vfpData, simName, values[-1], project_root)
    print("AutoRunner simulations complete.")

elif continuation:
    print("Continuation mode enabled.")
    if "wingConfig" in vfpData.get("inputFiles", {}):
        dumpFileName = vfpData["formData"].get("wingDumpName", vfpData["formData"].get("dumpName"))
        print("Simulating wing (continuation mode)...")
        print(f"Using dump file: {dumpFileName}")
        vfpData = run_vfp_continuation(wingSimDir, vfpData, "wingConfig", dumpFileName)
    if (
        "tailConfig" in vfpData.get("inputFiles", {}) and
        vfpData["inputFiles"]["tailConfig"]["fileNames"].get("DatFile")
    ):
        dumpFileName = vfpData["formData"].get("tailDumpName", vfpData["formData"].get("dumpName"))
        vfpData = run_vfp_continuation(tailSimDir, vfpData, "tailConfig", dumpFileName)
    save_vfp_results(vfpData, simName, aoa, project_root)

else:
    print("Standard mode enabled.")
    if "wingConfig" not in vfpData.get("inputFiles", {}):
        raise RuntimeError("No wingConfig found in VFP data.")

    print("Simulating wing (standard mode)...")
    vfpData = run_vfp(wingSimDir, vfpData, "wingConfig")

    if (
        "tailConfig" in vfpData.get("inputFiles", {}) and
        vfpData["inputFiles"]["tailConfig"]["fileNames"].get("DatFile")
    ):
        print("Computing downwash and modifying tail flow...")

        wing_flow = os.path.join(wingSimDir, vfpData["inputFiles"]["wingConfig"]["fileNames"]["DatFile"])
        tail_flow = os.path.join(tailSimDir, vfpData["inputFiles"]["tailConfig"]["fileNames"]["DatFile"])
        tail_geo  = os.path.join(tailSimDir, vfpData["inputFiles"]["tailConfig"]["fileNames"]["GeoFile"])
        tail_map  = os.path.join(tailSimDir, vfpData["inputFiles"]["tailConfig"]["fileNames"]["MapFile"])

        ALPHAW, MACHW = extract_alpha_mach_from_flow(wing_flow)
        cp_files = [f for f in os.listdir(wingSimDir) if f.lower().endswith('.cp')]
        if not cp_files:
            raise RuntimeError("No .cp file found after wing simulation.")
        cp_file = os.path.join(wingSimDir, cp_files[0])

        downwash_results = compute_downwash_LLT(cp_file, tail_geo, tail_spec, save_plots=False)
        ALPHAE = downwash_results.get('effective_epsilon_deg')
        MACHT = downwash_results.get('avg_local_mach')
        ALPHAT = round(ALPHAW - abs(ALPHAE), 4)
        MACHT = round(MACHT, 4)
        print(f"Downwash: ALPHAW={ALPHAW}, ALPHAE={ALPHAE}, ALPHAT={ALPHAT}, MACHT={MACHT}")

        if "results" not in vfpData:
            vfpData["results"] = {}
        if "tailConfig" not in vfpData["results"]:
            vfpData["results"]["tailConfig"] = {}
        vfpData["results"]["tailConfig"]["flowLLT"] = downwash_results

        modify_tail_flow_file_preserve_format(tail_flow, ALPHAT, MACHT)

        with open(tail_flow, "r", encoding="utf-8") as f:
            tail_flow_data = f.read()
        vfpData["inputFiles"]["tailConfig"]["fileData"][os.path.basename(tail_flow)] = tail_flow_data

        print("Simulating tail (standard mode)...")
        vfpData = run_vfp(tailSimDir, vfpData, "tailConfig")

    save_vfp_results(vfpData, simName, aoa, project_root)

# --- CLEANUP (commented out for debugging) ---
# cleanup_sim_dir(simBaseDir)


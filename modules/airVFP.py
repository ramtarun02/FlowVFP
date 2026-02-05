import os
import shutil
import logging
import re
import time
import subprocess
from vfp_processing.downwashLLT import compute_downwash_LLT
from vfp_processing.readVFP import readFLOW
# from utils.VFP_Data_Extraction_Utils import extract_values
# from utils.VFP_File_Generation_Utils import process_files
import numpy as np

def convert_ndarray_to_list(obj):
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, dict):
        return {k: convert_ndarray_to_list(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_ndarray_to_list(i) for i in obj]
    else:
        return obj

def safe_copy(src, dst, retries=3, delay=1):
    try:
        if os.path.abspath(src) == os.path.abspath(dst):
            logging.debug(f"Skipping copy: source and destination are the same ({src})")
            return
        for attempt in range(retries):
            try:
                shutil.copy2(src, dst)
                logging.debug(f"Copied {src} to {dst}")
                return
            except PermissionError as e:
                if attempt < retries - 1:
                    logging.warning(f"PermissionError copying {src} to {dst}: {e}. Retrying in {delay}s...")
                    time.sleep(delay)
                else:
                    logging.error(f"PermissionError copying {src} to {dst}: {e}")
    except Exception as e:
        logging.error(f"Error copying {src} to {dst}: {e}")



def extract_alpha_mach_from_flow(flow_file, level_idx=1):
    """
    Extract ALPHA and MACH NO from a VFP flow file (.DAT) using readFLOW.
    """
    logging.debug(f"Trying to open flow file: {flow_file}")
    if not os.path.isfile(flow_file):
        logging.error(f"Flow file does not exist: {flow_file}")
        raise FileNotFoundError(f"Flow file does not exist: {flow_file}")
    try:
        result = readFLOW(flow_file)
        level_key = f"level{level_idx}"
        first_line = result['levels'][level_key][0]
        parts = first_line.split()
        mach = float(parts[3])
        alpha = float(parts[4])
    except Exception as e:
        logging.error(f"Failed to extract alpha/mach from flow file: {flow_file} - {e}")
        raise
    logging.debug(f"[STEP 2] Extracted ALPHAW={alpha}, MACHW={mach} from {flow_file}")
    return alpha, mach

def run_vfp_simulation_in_case_folder(case_folder, geo_file, map_file, flow_file, bat_file="runvfphe_v4.bat", emit_message=None):
    """
    Run VFP simulation in standard mode in the given case folder.
    Implements the logic from start_simulation in app.py.
    Logs the output of the batch file execution.
    """
    logging.debug(f"[STEP 3] Preparing files for simulation in {case_folder}")

    # Ensure case folder exists
    os.makedirs(case_folder, exist_ok=True)

    # Copy simulation input files to case folder
    for f in [geo_file, map_file, flow_file]:
        src = f if os.path.isabs(f) else os.path.join(os.getcwd(), f)
        dst = os.path.join(case_folder, os.path.basename(f))
        if os.path.exists(src):
            safe_copy(src, dst)
            logging.debug(f"Copied {src} to {dst}")
        else:
            logging.warning(f"File {src} not found for simulation.")

    # Copy all files from ../tools/vfp to case folder (including executables and batch files)
    tools_vfp_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'modules', 'utils'))
    logging.debug(f"Tools VFP directory: {tools_vfp_dir}")
    if not os.path.exists(tools_vfp_dir):
        logging.error(f"Tools VFP directory does not exist: {tools_vfp_dir}")
    else:
        for item in os.listdir(tools_vfp_dir):
            src_path = os.path.join(tools_vfp_dir, item)
            dst_path = os.path.join(case_folder, item)
            if os.path.isfile(src_path):
                shutil.copy2(src_path, dst_path)
                logging.debug(f"Copied tool file {src_path} to {dst_path}")
            elif os.path.isdir(src_path):
                if os.path.exists(dst_path):
                    shutil.rmtree(dst_path)
                shutil.copytree(src_path, dst_path)
                logging.debug(f"Copied tool directory {src_path} to {dst_path}")

    # Prepare batch arguments (standard mode: no continuation, no excrescence)
    map_file_base = os.path.splitext(os.path.basename(map_file))[0]
    geo_file_base = os.path.splitext(os.path.basename(geo_file))[0]
    flow_file_base = os.path.splitext(os.path.basename(flow_file))[0]
    bat_args = [map_file_base, geo_file_base, flow_file_base, "n", "n", ""]

    # Ensure batch file exists in case folder
    bat_path = os.path.join(case_folder, bat_file)
    if not os.path.exists(bat_path):
        logging.error(f"Batch file {bat_file} not found in {case_folder}")
        return None

    # Build command
    cmd = [bat_path] + bat_args
    logging.debug(f"[STEP 3] Executing: {cmd} in {case_folder}")

    # Run the batch file and log output
    try:
        process = subprocess.Popen(
            cmd,
            cwd=case_folder,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            shell=True,
            universal_newlines=True
        )
        for line in process.stdout:
            msg = f"[VFP-BAT] {line.strip()}"
            logging.info(msg)
            if emit_message:
                emit_message(msg)
        process.wait()
        if process.returncode != 0:
            err_msg = f"Batch file exited with code {process.returncode}"
            logging.error(err_msg)
            if emit_message:
                emit_message(err_msg)
    except Exception as e:
        err_msg = f"Failed to execute batch file: {e}"
        logging.error(err_msg)
        if emit_message:
            emit_message(err_msg)
        return None

    # Find .cp file in case folder
    cp_files = [f for f in os.listdir(case_folder) if f.lower().endswith('.cp')]
    cp_file = os.path.join(case_folder, cp_files[0]) if cp_files else None
    logging.debug(f"[STEP 3] Simulation complete. CP file: {cp_file}")
    return cp_file

def modify_tail_flow_file_preserve_format(tail_flow, new_aoa, new_mach):
    """
    Modify the Mach and AoA in the first line of every level in the tail flow file,
    preserving all original formatting (spaces, tabs, etc).
    All other lines are kept exactly as they are.
    """
    # Read all lines
    with open(tail_flow, 'r') as f:
        lines = f.readlines()

    # Use the same extraction logic as in VFP_File_Generation_Utils
    from utils.VFP_File_Generation_Utils import extract_levels_and_fuse

    data_json = extract_levels_and_fuse(lines)

    # Prepare new values as strings with 4 decimals
    new_mach_str = f"{float(new_mach):.4f}"
    new_aoa_str = f"{float(new_aoa):.4f}"

    # Modify AoA and Mach in each level's first line
    for key in data_json:
        if key.startswith('level'):
            block = data_json[key]
            first_line = block[0]
            # Regex to match up to Mach and AoA (preserving all whitespace)
            pattern = re.compile(
                r'(^\s*2\s+\S+\s+\d+\s+)'  # Prefix up to Mach
                r'([-+]?\d+\.\d+)(\s+)'    # Mach number
                r'([-+]?\d+\.\d+)(\s+)'    # AoA
            )
            def repl(m):
                return m.group(1) + new_mach_str + m.group(3) + new_aoa_str + m.group(5)
            block[0] = pattern.sub(repl, first_line, count=1)
            data_json[key] = block

    # Reconstruct lines with modified blocks (preserving all other lines)
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

    # Write back to the same file
    with open(tail_flow, 'w') as f:
        f.writelines(new_lines)
    logging.debug(f"[STEP 5] Modified tail flow file written to: {tail_flow} (format preserved)")



def multi_stage_tail_downwash(
    case_folder,
    wing_geo, wing_map, wing_flow,
    tail_geo, tail_map, tail_flow, tail_spec, 
    emit_message=None
):
    """
    Multi-stage computation for tail downwash and simulation.
    All files and simulations are executed in the single provided case_folder.
    """
    logging.debug("[START] Multi-stage tail downwash computation initiated.")

    os.makedirs(case_folder, exist_ok=True)
    logging.debug(f"[STEP 1] Using case folder: {case_folder}")

    # STEP 2: Extract ALPHAW and MACHW from wing flow file
    ALPHAW, MACHW = extract_alpha_mach_from_flow(wing_flow)

    # STEP 3: Run VFP simulation for the wing (standard mode)
    cp_file = run_vfp_simulation_in_case_folder(
        case_folder, wing_geo, wing_map, wing_flow, emit_message=emit_message
    )
    if not cp_file:
        logging.error("Wing simulation failed: .cp file not found.")
        return None

    # STEP 4: Compute downwash using downwashLLT
    logging.debug(f"[STEP 4] Computing downwash using downwashLLT with CP={cp_file}, Tail GEO={tail_geo}, Tail Spec={tail_spec}")
    results = compute_downwash_LLT(cp_file, tail_geo, tail_spec, save_plots=False)
    ALPHAE = results.get('effective_epsilon_deg')
    MACHT = results.get('avg_local_mach')
    logging.debug(f"[STEP 4] Downwash results: ALPHAE={ALPHAE}, MACHT={MACHT}")

    # STEP 5: Calculate ALPHAT and modify tail flow file (in-place, all levels, 4 decimals)
    ALPHAT = round(ALPHAW - abs(ALPHAE), 4)
    MACHT = round(MACHT, 4)
    logging.debug(f"[STEP 5] Calculated ALPHAT = ALPHAW - ALPHAE = {ALPHAW} - {abs(ALPHAE)} = {ALPHAT}")

    # Work on the copy of the tail flow file in the case folder
    tail_flow_case = os.path.join(case_folder, os.path.basename(tail_flow))
    if not os.path.exists(tail_flow_case):
        shutil.copy2(tail_flow, tail_flow_case)
        logging.debug(f"Copied tail flow file to case folder: {tail_flow_case}")

    modify_tail_flow_file_preserve_format(tail_flow_case, ALPHAT, MACHT)

    # STEP 6: Run VFP simulation for the tail (standard mode)
    logging.debug(f"[STEP 6] Running VFP simulation for tail with GEO={tail_geo}, MAP={tail_map}, FLOW={tail_flow_case}")
    tail_cp_file = run_vfp_simulation_in_case_folder(
        case_folder, tail_geo, tail_map, tail_flow_case, emit_message=emit_message
    )
    logging.debug(f"[STEP 6] Tail simulation complete.")

    logging.debug("[END] Multi-stage computation finished.")
    return convert_ndarray_to_list({
        "case_folder": case_folder,
        "ALPHAW": ALPHAW,
        "MACHW": MACHW,
        "ALPHAE": ALPHAE,
        "MACHT": MACHT,
        "ALPHAT": ALPHAT,
    })

if __name__ == "__main__":
    logging.basicConfig(level=logging.DEBUG)

    # Provide the full paths to your files here
    case_folder = r"C:\Users\Tarun.Ramprakash\Downloads\VFP-Python\VFP_Full_Sim"
    wing_geo    = r"C:\Users\Tarun.Ramprakash\Cranfield University\Davide Di Pasquale - VFP_Tarun\CRM_Wing_M085_Re19p8M\CRM_Wing_19p8M_m085\CRM1wbs.GEO"
    wing_map    = r"C:\Users\Tarun.Ramprakash\Cranfield University\Davide Di Pasquale - VFP_Tarun\CRM_Wing_M085_Re19p8M\CRM_Wing_19p8M_m085\CRM1wb.map"
    wing_flow   = r"C:\Users\Tarun.Ramprakash\Cranfield University\Davide Di Pasquale - VFP_Tarun\CRM_Wing_M085_Re19p8M\CRM_Wing_19p8M_m085\M085Re19p8ma+0p00.DAT"
    tail_geo    = r"C:\Users\Tarun.Ramprakash\Cranfield University\Davide Di Pasquale - VFP_Tarun\CRM_Tail_VFP_Study\CRM_tail_M085_R19p8M\CRMHT4.GEO"
    tail_map    = r"C:\Users\Tarun.Ramprakash\Cranfield University\Davide Di Pasquale - VFP_Tarun\CRM_Tail_VFP_Study\CRM_tail_M085_R19p8M\CRMHT.map"
    tail_flow   = r"C:\Users\Tarun.Ramprakash\Cranfield University\Davide Di Pasquale - VFP_Tarun\CRM_Tail_VFP_Study\CRM_tail_M085_R19p8M\M085Re19p0ma+0p00.DAT"
    tail_spec   = r"C:\Users\Tarun.Ramprakash\Cranfield University\Davide Di Pasquale - VFP_Tarun\CRM_Tail_VFP_Study\crmtail.tail"

    results = multi_stage_tail_downwash(
        case_folder,
        wing_geo, wing_map, wing_flow,
        tail_geo, tail_map, tail_flow, tail_spec
    )

    print("Multi-stage tail downwash results:")
    for k, v in results.items():
        print(f"{k}: {v}")



# if __name__ == "__main__":


#     import sys
#     if len(sys.argv) != 10:
#         print("Usage: airVFP.py <case_folder> <wing_geo> <wing_map> <wing_flow> <tail_geo> <tail_map> <tail_flow> <tail_spec>")
#         sys.exit(1)
#     case_folder, wing_geo, wing_map, wing_flow, tail_geo, tail_map, tail_flow, tail_spec, emit_call = sys.argv[1:]
#     print("[Multi-Stage] Starting multi_stage_tail_downwash...")
#     results = multi_stage_tail_downwash(case_folder, wing_geo, wing_map, wing_flow, tail_geo, tail_map, tail_flow, tail_spec, emit_message=emit_call)
#     results = convert_ndarray_to_list(results)
#     print("[Multi-Stage] Computation finished.")
#     print("[Multi-Stage] Results:")
#     print(results)
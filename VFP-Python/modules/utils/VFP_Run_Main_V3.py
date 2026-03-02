import subprocess
import os
import re
import sys

if len(sys.argv) < 3:
    print("Usage: python your_script.py <map_file> <geo_file>")
    sys.exit(1)

def extract_aoa_from_dat_filename(filepath):
    filename = os.path.basename(filepath)
    match = re.search(r"M\d+Re\d+p\d+ma([-+]?\d+p\d+)\.(dat|DAT)$", filename)
    if match:
        aoa_str = match.group(1).replace('p', '.')
        try:
            return round(float(aoa_str), 2)
        except ValueError:
            return None
    return None

map_name = sys.argv[1].strip()
geo_name = sys.argv[2].strip()
flow_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "Flow_Conditions")
print(flow_dir)

# Build dictionary of AoA -> filename
flow_dict = {}
for fname in os.listdir(flow_dir):
    if fname.endswith(".DAT") or fname.endswith(".dat"):
        aoa = extract_aoa_from_dat_filename(fname)
        if aoa is not None:
            flow_dict[aoa] = fname

if not flow_dict:
    print("No valid .dat files found in Flow_Conditions.")
    sys.exit(1)

# Always run AoA=0 first if present
zero_aoa = 0.0
run_order = []

if zero_aoa in flow_dict:
    run_order.append(zero_aoa)
    # Find all negative AoA (excluding zero), sort descending
    neg_aoas = sorted([a for a in flow_dict if a < 0], reverse=True)
    # Find all positive AoA (excluding zero), sort ascending
    pos_aoas = sorted([a for a in flow_dict if a > 0])
    # If there are negative AoA, run them after zero in descending order
    if neg_aoas:
        run_order.extend(neg_aoas)
    # Otherwise, run positive AoA in ascending order
    else:
        run_order.extend(pos_aoas)
else:
    # If no zero AoA, just run all in ascending order
    run_order = sorted(flow_dict.keys())

ordered_flows = [flow_dict[aoa] for aoa in run_order]

# Run the first file as non-continuation
first_flow = os.path.splitext(ordered_flows[0])[0]
print(f"Running first case (no continuation): {first_flow}")
subprocess.run(['runvfphe_v4.bat', map_name, geo_name, first_flow, 'n', 'n', first_flow], shell=True)

# Run the rest as continuation runs, using previous flow as dump
previous_flow = first_flow
for flow_file in ordered_flows[1:]:
    current_flow = os.path.splitext(flow_file)[0]
    quoted_flow = '"' + current_flow + '"'
    dump_file = geo_name + previous_flow
    print(f"Running continuation for: {quoted_flow} (dump from {previous_flow}, dump file: {dump_file})")
    subprocess.run(['runvfphe_v4.bat', map_name, geo_name, current_flow, 'n', 'y', dump_file], shell=True)
    previous_flow = current_flow

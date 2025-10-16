import subprocess
import os
import re
import sys


if len(sys.argv) < 2:
    print("Usage: python your_script.py <argument>")
    sys.exit(1)

def extract_aoa_from_dat_filename(filepath):
    filename = os.path.basename(filepath)
    match = re.search(r"M\d+Re\d+p\d+ma([-+]?\d+p\d+)\.dat$", filename)
    if match:
        aoa_str = match.group(1).replace('p', '.')
        try:
            return round(float(aoa_str), 2)
        except ValueError:
            return None
    return None


map = sys.argv[1]
geo = sys.argv[2]
# Get user input once
map_name = map.strip()
geo_name = geo.strip()
# Define flow directory
flow_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "Flow_Conditions")
print(flow_dir)



# Build dictionary of AoA -> filename
flow_dict = {}
for fname in os.listdir(flow_dir):
    if fname.endswith(".dat"):
        aoa = extract_aoa_from_dat_filename(fname)
        if aoa is not None:
            flow_dict[aoa] = fname

# Sort by AoA (ascending order)
sorted_aoas = sorted(flow_dict.keys())
ordered_flows = [flow_dict[aoa] for aoa in sorted_aoas]

# Run the first file as non-continuation
first_flow = os.path.splitext(ordered_flows[0])[0]
print(f"Running first case (no continuation): {first_flow}")
subprocess.run(['runvfphe_v4.bat', map_name, geo_name, first_flow, 'n', 'n', first_flow], shell=True)

# Run the rest as continuation runs, using previous flow as dump
previous_flow = first_flow
for flow_file in ordered_flows[1:]:
    current_flow = os.path.splitext(flow_file)[0]
    quoted_flow = '"' + current_flow + '"' 
    dump_file =  geo_name + previous_flow
    print(f"Running continuation for: {quoted_flow} (dump from {previous_flow}, dumb file: {dump_file})")
    subprocess.run(['runvfphe_v4.bat', map_name, geo_name, current_flow, 'n', 'y', dump_file], shell=True)
    previous_flow = current_flow

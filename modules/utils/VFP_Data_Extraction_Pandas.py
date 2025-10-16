#========PROGRAM DESCRIPTION========#
"""
This program gets a folder path from the user. It then opens all the .forces files in that folder path and reads the specified data.
Finally, it uses the pandas library to make a table with the aquired values and stores them in a CSV document comma separated
"""

#Libraries
"""Make sure you have all the libraries below installed"""

import re
import pandas as pd
import glob
import os
#===========User Defined Functions===========#

#Function to extract values from files
def extract_values(line, label):
    pattern = rf"{re.escape(label)}\s*=\s*(-?\d+\.\d+)"
    match = re.search(pattern, line) #Search for a pattern of a number in line (Label is the name of the value how it appears on the forces file)

    if match:
        return float(match.group(1)) #Return the value if it matches the specified form
    return None

# Parse forces file to find Level 1 specifically
def parse_forces_file_for_level_1(file_path):
    """
    Parse the forces file and extract all levels, then return data specifically from Level 1.
    This handles cases where levels appear in any order (3, 2, 1 or 1, 2, 3, etc.)
    """
    levels_data = {}
    current_level = None
    current_level_lines = []
    
    with open(file_path, 'r') as f:
        lines = f.readlines()
    
    # First pass: identify all levels and their content
    for i, line in enumerate(lines):
        line_stripped = line.strip()
        
        # Check for level markers (LEV= followed by a number)
        level_match = re.search(r'LEV=\s*(\d+)', line_stripped)
        if level_match:
            # Save previous level data if it exists
            if current_level is not None and current_level_lines:
                levels_data[current_level] = current_level_lines.copy()
            
            # Start new level
            current_level = int(level_match.group(1))
            current_level_lines = [line_stripped]
        elif current_level is not None:
            # Add line to current level
            current_level_lines.append(line_stripped)
    
    # Don't forget the last level
    if current_level is not None and current_level_lines:
        levels_data[current_level] = current_level_lines.copy()
    
    print(f"Found levels in {os.path.basename(file_path)}: {list(levels_data.keys())}")
    
    # Return Level 1 data if it exists
    if 1 in levels_data:
        return levels_data[1]
    else:
        print(f"Warning: Level 1 not found in {file_path}. Available levels:", list(levels_data.keys()))
        return None

#Extract all values at once using extract_values from Level 1 specifically
def extract_data(file_path):
    data = {
        'Filename': os.path.basename(file_path),
        'ALPHA': None,
        'MACH NO': None,
        'Cdv': None,
        'Cdi': None,
        'CL': None,
        'CDtotVFP': None,
        'CDtotIBE': None,
    }
    
    # Parse forces file for Level 1 data specifically
    level_1_lines = parse_forces_file_for_level_1(file_path)
    
    if level_1_lines is None:
        print(f"Warning: Could not find Level 1 data in {file_path}")
        return data
    
    # Extract data from Level 1 lines only
    for line in level_1_lines:
        if data['ALPHA'] is None and 'ALPHA' in line:
            data['ALPHA'] = extract_values(line, "ALPHA")
        if data["MACH NO"] is None and "MACH NO" in line:
            data["MACH NO"] = extract_values(line, "MACH NO")
        if data["Cdv"] is None and "Total viscous drag" in line:
            data["Cdv"] = extract_values(line, "Total viscous drag")
        if data["Cdi"] is None and "CD(vortd)" in line:
            data["Cdi"] = extract_values(line, "CD(vortd)")
        if data["CL"] is None and "CLTOT(IBE)" in line:
            data["CL"] = extract_values(line, "CLTOT(IBE)")
        if data["CDtotVFP"] is None and "CDTOT(VFP)" in line:
            data["CDtotVFP"] = extract_values(line, "CDTOT(VFP)")
        if data["CDtotIBE"] is None and "CDTOT(IBE)" in line:
            data["CDtotIBE"] = extract_values(line, "CDTOT(IBE)")

        # Break early if all values are found
        if all(v is not None for v in data.values() if v != data['Filename']):
            break
    
    print(f"Extracted from Level 1: ALPHA={data['ALPHA']}, MACH NO={data['MACH NO']}, CL={data['CL']}")
    return data

# Function to process the file
def process_file(original_file, new_file, mach_str, aoa_str):
    pattern = re.compile(rf"{re.escape(mach_str)}\s+{re.escape(aoa_str)}")

    with open(original_file, 'r') as f:
        lines = f.readlines()

    pattern_indices = [
        i for i, line in enumerate(lines)
        if pattern.search(line)
    ]

    if len(pattern_indices) >= 3:
        start = pattern_indices[0]
        end = pattern_indices[2]
        modified_lines = [
            line for i, line in enumerate(lines)
            if i < start or i >= end
        ]
    else:
        modified_lines = lines

    with open(new_file, 'w') as f:
        f.writelines(modified_lines)


# === MAIN ===
folder_path = input("Enter folder path with the .forces files: ").strip()
file_paths = glob.glob(os.path.join(folder_path, '*.forces'))

# Extract data from all files (Level 1 specifically)
all_data = [extract_data(path) for path in file_paths]

df = pd.DataFrame(all_data)
df_sorted = df.sort_values(by='ALPHA')
print(df_sorted.to_string(index=False))
df_sorted.to_csv("VFP_Data_Extracted", index=False)
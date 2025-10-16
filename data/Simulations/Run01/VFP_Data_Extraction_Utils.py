# VFP_Data_Extraction_Utils.py

import re
import os
from io import StringIO
import pandas as pd

# Extract a single numeric value by label from a line
def extract_values(line, label):
    pattern = rf"{re.escape(label)}\s*=\s*(-?\d+\.\d+)"
    match = re.search(pattern, line)
    if match:
        return float(match.group(1))
    return None

# Extract a string-formatted numeric value preserving decimal places
def extract_value_str_preserve_precision(line, label):
    pattern = rf"{re.escape(label)}\s*=\s*(-?\d+\.\d+)"
    match = re.search(pattern, line)
    if match:
        return match.group(1)  # Return as string to preserve formatting
    return None

# Extract angle of attack from a wavedrag filename
def extract_aoa_from_filename(filepath):
    filename = os.path.basename(filepath)
    match = re.search(r"M\d+Re\d+p\d+ma([-+]?\d+p\d+)", filename)
    if match:
        aoa_str = match.group(1).replace('p', '.')
        return round(float(aoa_str), 4)
    return None

# Extract angle of attack from a .forces filename
def extract_aoa_from_forces_filename(filepath):
    filename = os.path.basename(filepath)
    match = re.search(r"M\d+Re\d+p\d+ma([-+]?\d+p\d+)", filename)
    if match:
        aoa_str = match.group(1).replace('p', '.')
        return round(float(aoa_str), 4)
    return None

# Parse all levels and return Level 1 data specifically
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
        line = line.strip()
        
        # Check for level markers (LEV= followed by a number)
        level_match = re.search(r'LEV=\s*(\d+)', line)
        if level_match:
            # Save previous level data if it exists
            if current_level is not None and current_level_lines:
                levels_data[current_level] = current_level_lines.copy()
            
            # Start new level
            current_level = int(level_match.group(1))
            current_level_lines = [line]
        elif current_level is not None:
            # Add line to current level
            current_level_lines.append(line)
    
    # Don't forget the last level
    if current_level is not None and current_level_lines:
        levels_data[current_level] = current_level_lines.copy()
    
    print(f"Found levels in forces file: {list(levels_data.keys())}")
    
    # Return Level 1 data if it exists
    if 1 in levels_data:
        print("Extracting data from Level 1")
        return levels_data[1]
    else:
        print("Warning: Level 1 not found in forces file. Available levels:", list(levels_data.keys()))
        return None

# Extract data from Level 1 specifically
def extract_level_1_data(level_1_lines):
    """
    Extract data from Level 1 lines specifically
    """
    data = {
        'ALPHA': None,
        'MACH NO': None,
        'Cdv': None,
        'Cdi': None,
        'CL': None,
        'CDtotVFP': None,
        'CDtotIBE': None,
        'CMTOT(VFP)': None,
    }
    
    for line in level_1_lines:
        # Extract values from Level 1 data
        if data['ALPHA'] is None and 'ALPHA' in line:
            data['ALPHA'] = extract_values(line, 'ALPHA')
        if data['MACH NO'] is None and 'MACH NO' in line:
            data['MACH NO'] = extract_values(line, 'MACH NO')
        if data['Cdv'] is None and 'Total viscous drag' in line:
            data['Cdv'] = extract_values(line, 'Total viscous drag')
        if data['Cdi'] is None and 'CD(vortd)' in line:
            data['Cdi'] = extract_values(line, 'CD(vortd)')
        if data['CL'] is None and 'CLTOT(IBE)' in line:
            data['CL'] = extract_values(line, 'CLTOT(IBE)')
        if data['CDtotVFP'] is None and 'CDTOT(VFP)' in line:
            data['CDtotVFP'] = extract_values(line, 'CDTOT(VFP)')
        if data['CDtotIBE'] is None and 'CDTOT(IBE)' in line:
            data['CDtotIBE'] = extract_values(line, 'CDTOT(IBE)')
        if data['CMTOT(VFP)'] is None and 'CMTOT(VFP)' in line:
            data['CMTOT(VFP)'] = extract_values(line, 'CMTOT(VFP)')
    
    return data

# Read a .forces file and a wavedrag file, extract fields from Level 1 specifically
def extract_data(file_path_forces, file_path_wavedrag):
    data = {
        'Filename': os.path.basename(file_path_forces),
        'ALPHA': None,
        'MACH NO': None,
        'Cdv': None,
        'Cdi': None,
        'CL': None,
        'CDtotVFP': None,
        'CDtotIBE': None,
        'CMTOT(VFP)': None,
        'CDW_Upper': None,
        'CDW_Lower': None,
        'CDW(tot)': None,
    }

    # Parse forces file for Level 1 data specifically
    level_1_lines = parse_forces_file_for_level_1(file_path_forces)
    
    if level_1_lines is None:
        print(f"Warning: Could not find Level 1 data in {file_path_forces}")
        return data
    
    # Extract data from Level 1 lines
    level_1_data = extract_level_1_data(level_1_lines)
    
    # Update main data dictionary with Level 1 values
    for key in level_1_data:
        if key in data:
            data[key] = level_1_data[key]

    # Process wavedrag file (unchanged)
    with open(file_path_wavedrag, 'r') as f:
        count = 0
        cdw_upper_str = None
        cdw_lower_str = None
        for line in f:
            if 'Total wave drag for block is CDW(tot)' in line:
                val_str = extract_value_str_preserve_precision(line, 'Total wave drag for block is CDW(tot)')
                val = float(val_str)
                if count == 0:
                    data['CDW_Upper'] = val_str
                    cdw_upper_val = val
                elif count == 1:
                    data['CDW_Lower'] = val_str
                    cdw_lower_val = val
                count += 1
                if count == 2:
                    break

    if data['CDW_Upper'] is not None and data['CDW_Lower'] is not None:
        data['CDW(tot)'] = cdw_upper_val + cdw_lower_val

    return data
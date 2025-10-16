import re
import os
import shutil
import json


def extract_levels_and_fuse(lines):
    levels = {}
    fuse = []
    # Check second line after title
    if len(lines) > 1:
        second_line = lines[1].strip()
        try:
            n = int(second_line)
        except ValueError:
            n = 0
        if n == 0:
            i = 2
        else:
            fuse = lines[2:2+n]
            i = 2 + n
    else:
        i = 2

    level_idx = 1
    while i < len(lines):
        line = lines[i]
        # Only consider lines starting with integer 2
        if line.lstrip().startswith('2'):
            levels[f'level{level_idx}'] = lines[i:i+15]
            i += 15
            level_idx += 1
        else:
            i += 1
    result = {}
    if fuse:
        result['fuse'] = fuse
    result.update(levels)
    return result

def process_file(original_file, mach_str, aoa_str, apply_filter=False):
    with open(original_file, 'r') as f:
        lines = f.readlines()

    # Parse levels and fuse
    data_json = extract_levels_and_fuse(lines)

    # If not applying filter, just return lines and data_json
    if not apply_filter:
        return lines, data_json

    # Modify AoA in each level's first line if mach matches
    for key in data_json:
        if key.startswith('level'):
            block = data_json[key]
            first_line = block[0]
            pattern = re.compile(
                r'(^\s*2\s+\S+\s+\d+\s+)'  # Prefix up to mach
                r'([-+]?\d+\.\d+)(\s+)'    # Mach number
                r'([-+]?\d+\.\d+)(\s+)'    # AoA
            )
            def repl(m):
                mach_val = m.group(2)
                # Only replace if mach matches
                if f"{float(mach_val):.4f}" == f"{float(mach_str):.4f}":
                    return m.group(1) + mach_val + m.group(3) + f"{float(aoa_str):.4f}" + m.group(5)
                else:
                    return m.group(0)
            block[0] = pattern.sub(repl, first_line, count=1)
            data_json[key] = block

    # Reconstruct lines with modified blocks
    new_lines = []
    # Title and second line
    new_lines.append(lines[0])
    new_lines.append(lines[1])
    idx = 2
    # If fuse exists, add fuse lines
    if 'fuse' in data_json:
        fuse_lines = data_json['fuse']
        new_lines.extend(fuse_lines)
        idx += len(fuse_lines)
    level_idx = 1
    while idx < len(lines):
        line = lines[idx]
        if line.lstrip().startswith('2') and f'level{level_idx}' in data_json:
            new_lines.extend(data_json[f'level{level_idx}'])
            idx += 15
            level_idx += 1
        else:
            new_lines.append(line)
            idx += 1

    return new_lines, data_json


def iterate_AoA_modifications(original_file, mach_str, initial_aoa_str, output_base_name, d, n):
    NUMBER_OF_ITERATIONS = int(float(n) / float(d))
    STEP = float(d)
    aoa = float(initial_aoa_str)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    flow_dir = os.path.join(script_dir, "Flow_Conditions")
    os.makedirs(flow_dir, exist_ok=True)

    for i in range(NUMBER_OF_ITERATIONS + 1):
        new_aoa = aoa + i * STEP
        new_aoa_str = f"{new_aoa:.4f}"

        lines, data_json = process_file(original_file, mach_str, new_aoa_str, apply_filter=True)

        sign = "-" if new_aoa < 0 else "+"
        aoa_for_filename = f"{abs(new_aoa):.2f}".replace('.', 'p')
        output_filename = f"{output_base_name}{aoa_for_filename}.dat"
        output_file_path = os.path.join(flow_dir, output_filename)

        # Only include all levels if aoa == 0, else only level3
        if abs(new_aoa) < 1e-8:  # aoa == 0
            output_lines = lines
        else:
            output_lines = []
            # Always include title and second line
            output_lines.append(lines[0])
            output_lines.append(lines[1])
            # Include fuse if present
            if 'fuse' in data_json:
                output_lines.extend(data_json['fuse'])
            # Include only level3 if present
            if 'level3' in data_json:
                level3_lines = data_json['level3'][:]
                # Modify first digit of second term in first line of level3
                if level3_lines:
                    def mod_first_digit(line):
                        pattern = re.compile(r'^(\s*2\s+)(\d{20})(.*)')
                        m = pattern.match(line)
                        if m:
                            new_second = '1' + m.group(2)[1:]
                    
        # Ensure the line ends with a newline
                            rest = m.group(3)
                            if not rest.endswith('\n'):
                                rest += '\n'
                            return f"{m.group(1)}{new_second}{rest}"
                        return line if line.endswith('\n') else line + '\n'
                                        
                    level3_lines[0] = mod_first_digit(level3_lines[0])
                output_lines.extend(level3_lines)
            # Add one additional line with "    0"
            output_lines.append("    0\n")

        with open(output_file_path, 'w') as f:
            f.writelines(output_lines)

        # Save levels/fuse as JSON for each AoA
        json_filename = f"{output_base_name}{aoa_for_filename}.json"
        json_file_path = os.path.join(flow_dir, json_filename)
        with open(json_file_path, 'w') as jf:
            json.dump(data_json, jf, indent=4)



def run_aoa_generation(flow_file, d, n):
    original_file = flow_file.strip()
    # Accept AoA with or without sign, e.g. M085Re19p8ma1p00.dat or M085Re19p8ma-1p00.dat
    match = re.search(r"M(\d{3})[^-+]*([-+]?\d*p\d+|\d*p\d+)\.dat$", original_file)
    if not match:
        print("Filename format not recognized. Expected format like 'M085Re19p8ma-1p00.dat' or 'M085Re19p8ma1p00.dat'")
        return

    mach_str = f"{int(match.group(1)) / 100:.4f}"
    aoa_raw = match.group(2)
    # If AoA does not start with sign, assume positive
    if aoa_raw.startswith('-') or aoa_raw.startswith('+'):
        aoa_str = aoa_raw.replace('p', '.')
    else:
        aoa_str = f"{float(aoa_raw.replace('p', '.')):.4f}"

    # Always format AoA with sign for output_base_name logic
    if not str(aoa_str).startswith('-') and not str(aoa_str).startswith('+'):
        aoa_str = f"+{aoa_str}"

    output_base_name = os.path.splitext(original_file)[0]
    output_base_name = re.sub(r"[-+]?\d*p\d+$", "", output_base_name)

    try:
        iterate_AoA_modifications(original_file, mach_str, aoa_str, output_base_name, d, n)
    except FileNotFoundError:
        print(f"File '{original_file}' not found.")

            
def copy_generated_files_to_main_dir():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    flow_dir = os.path.join(script_dir, "Flow_Conditions")

    if not os.path.exists(flow_dir):
        print("Flow_Conditions directory does not exist.")
        return

    dat_files = [f for f in os.listdir(flow_dir) if f.endswith(".dat")]

    for fname in dat_files:
        src_path = os.path.join(flow_dir, fname)
        dst_path = os.path.join(script_dir, fname)
        shutil.copy2(src_path, dst_path)

    print(f"Copied {len(dat_files)} .dat files to main directory.")
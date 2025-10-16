import numpy as np
from scipy.interpolate import interp1d
import json
import re
import math

# Copy readGEO function from readGEO.py
def readGEO(filename):
    """
    Read GEO file and return structured data in JSON format
    """
    with open(filename, 'r') as f:
        lines = f.readlines()

    index = 0  # Track the current line being processed

    # Read the first line
    first_line = lines[index].strip().split()
    index += 1

    NSECT = int(first_line[0])  # Assuming NSECT is the first number

    Sections = []

    for i in range(NSECT):
        line = lines[index].strip().split()
        YSECT, G1SECT, G2SECT, HSECT = map(float, line[:4])
        index += 1

        # Read MU and ML values
        line = lines[index].strip().split()
        IMARK = int(line[0])
        MU = int(line[1])
        ML = int(line[2])
        XTWSEC = float(line[3])
        TWIST = float(line[4])
        index += 1

        # Read upper surface coordinates
        US = []
        for _ in range(MU):
            line = lines[index].strip().split()
            US.append((float(line[0]), float(line[1])))
            index += 1

        # Read lower surface coordinates
        LS = []
        for _ in range(ML):
            line = lines[index].strip().split()
            LS.append((float(line[0]), float(line[1])))
            index += 1

        US_N = []
        LS_N = []
        NTWIST = 0
        NHSECT = 0
        NYSECT = 0

        Sections.append({
            'YSECT': YSECT, 'G1SECT': G1SECT, 'G2SECT': G2SECT, 'HSECT': HSECT,
            'IMARK': IMARK, 'MU': MU, 'ML': ML,
            'XTWSEC': XTWSEC, 'TWIST': TWIST,
            'US': US, 'LS': LS, 'US_N': US_N, 'LS_N': LS_N, 
            'NTWIST': NTWIST, 'NHSECT': NHSECT, 'NYSECT': NYSECT
        })

    # Read NRAD and associated radii values
    NRAD = int(lines[index].strip().split()[0])
    index += 1

    XRAD = []
    RAD = []

    for _ in range(NRAD):
        line = lines[index].strip().split()
        XRAD.append(float(line[0]))
        RAD.append(float(line[1]))
        index += 1

    return {
        'fileName': filename,
        'NSECT': NSECT,
        'sections': Sections,
        'NRAD': NRAD,
        'XRAD': XRAD,
        'RAD': RAD
    }

def readFLOW(filename):
    """
    Read FLOW (.dat) file and return structured data in JSON format
    """
    with open(filename, 'r') as f:
        lines = f.readlines()

    result = {
        'fileName': filename,
        'title': '',
        'fuse': [],
        'levels': {}
    }

    if not lines:
        return result

    # First line is the title
    result['title'] = lines[0].strip() if lines else ''

    # Extract levels and fuse using similar logic as VFP_File_Generation_Utils.py
    if len(lines) > 1:
        second_line = lines[1].strip()
        try:
            n = int(second_line)
        except ValueError:
            n = 0
        
        if n == 0:
            i = 2
        else:
            result['fuse'] = [line.rstrip('\n') for line in lines[2:2+n]]
            i = 2 + n
    else:
        i = 2

    level_idx = 1
    while i < len(lines):
        line = lines[i]
        # Only consider lines starting with integer 2
        if line.lstrip().startswith('2'):
            level_lines = []
            for j in range(15):  # Each level has 15 lines
                if i + j < len(lines):
                    level_lines.append(lines[i + j].rstrip('\n'))
                else:
                    break
            result['levels'][f'level{level_idx}'] = level_lines
            i += 15
            level_idx += 1
        else:
            i += 1

    return result


def readFORCE(filename):
    """
    Read FORCES file and return structured data in JSON format
    """
    with open(filename, 'r') as f:
        content = f.read()
    
    lines = content.split('\n')

    forces_data = {
        'fileName': filename,
        'levels': {},
        'metadata': {
            'totalLines': len(lines),
            'parsedAt': None  # Will be set if needed
        }
    }

    def parse_viscous_drag_data(lines, start_index):
        viscous_data = {
            'header': lines[start_index],
            'columns': [],
            'J-2': [],
            'THETA': [],
            'CHORD': [],
            'SWEEP(L/E)': [],
            'SWEEP(T/E)': [],
            'CDV': [],
            'CDVC/CBAR': [],
            'CDVTE': [],
            'CDVTEC/CBAR': [],
            'totalViscousDrag': None,
            'totalViscousDragTE': None
        }

        header_index = start_index + 1
        while header_index < len(lines) and 'THETA' not in lines[header_index]:
            header_index += 1

        if header_index < len(lines):
            header_line = lines[header_index].strip()
            viscous_data['columns'] = header_line.split()

            for i in range(header_index + 1, len(lines)):
                line = lines[i].strip()

                if 'Total viscous drag =' in line:
                    match = re.search(r'Total viscous drag\s*=\s*([\d.-]+)', line)
                    if match:
                        viscous_data['totalViscousDrag'] = float(match.group(1))
                    continue

                if 'Total viscous drag te =' in line:
                    match = re.search(r'Total viscous drag te\s*=\s*([\d.-]+)', line)
                    if match:
                        viscous_data['totalViscousDragTE'] = float(match.group(1))
                    continue

                if not line or 'Total viscous drag' in line or 'LEV=' in line:
                    break

                values = line.split()
                if len(values) >= 9:  # Should have 9 columns for viscous drag data
                    try:
                        viscous_data['J-2'].append(float(values[0]))
                        viscous_data['THETA'].append(float(values[1]))
                        viscous_data['CHORD'].append(float(values[2]))
                        viscous_data['SWEEP(L/E)'].append(float(values[3]))
                        viscous_data['SWEEP(T/E)'].append(float(values[4]))
                        viscous_data['CDV'].append(float(values[5]))
                        viscous_data['CDVC/CBAR'].append(float(values[6]))
                        viscous_data['CDVTE'].append(float(values[7]))
                        viscous_data['CDVTEC/CBAR'].append(float(values[8]))
                    except (ValueError, IndexError):
                        pass  # Skip rows with invalid data

        return viscous_data

    def parse_level(lines, start_index):
        level_line = lines[start_index].strip()
        
        # Extract level parameters using regex
        level_match = re.search(r'LEV=\s*(\d+)', level_line)
        its_match = re.search(r'ITS=\s*(\d+)', level_line)
        mach_match = re.search(r'MACH\s+NO=\s*([\d.]+)', level_line)
        alpha_match = re.search(r'ALPHA=\s*([\d.-]+)', level_line)

        if not level_match:
            return None

        level = {
            'level': int(level_match.group(1)),
            'iterations': int(its_match.group(1)) if its_match else None,
            'machNumber': float(mach_match.group(1)) if mach_match else None,
            'alpha': float(alpha_match.group(1)) if alpha_match else None,
            'rawLine': level_line,
            'J': [],
            'YAVE': [],
            'YAVE/YTIP': [],
            'TWIST(deg)': [],
            'CHORD': [],
            'CL': [],
            'CD': [],
            'CM': [],
            'GAM': [],
            'NLEPOS': [],
            'coefficients': None,
            'viscousDragData': None,
            'vfpCoefficients': None,
            'ibeCoefficients': None,
            'vortexCoefficients': None,
            'wingArea': None
        }

        # Find the data table header
        header_index = start_index + 1
        while header_index < len(lines) and 'J   YAVE' not in lines[header_index]:
            header_index += 1

        if header_index < len(lines):
            # Skip header line
            for i in range(header_index + 1, len(lines)):
                line = lines[i].strip()
                if not line or 'CLTOT' in line or 'LEV=' in line:
                    break

                values = line.split()
                if len(values) >= 10:  # Should have 10 columns for main data
                    try:
                        level['J'].append(float(values[0]))
                        level['YAVE'].append(float(values[1]))
                        level['YAVE/YTIP'].append(float(values[2]))
                        level['TWIST(deg)'].append(float(values[3]))
                        level['CHORD'].append(float(values[4]))
                        level['CL'].append(float(values[5]))
                        level['CD'].append(float(values[6]))
                        level['CM'].append(float(values[7]))
                        level['GAM'].append(float(values[8]))
                        level['NLEPOS'].append(float(values[9]))
                    except (ValueError, IndexError):
                        pass  # Skip rows with invalid data

        # Find all coefficient lines
        for i in range(header_index, len(lines)):
            line = lines[i].strip()

            if 'CLTOT(VFP)' in line:
                cl_match = re.search(r'CLTOT\(VFP\)=\s*([\d.-]+)', line)
                cd_match = re.search(r'CDTOT\(VFP\)=\s*([\d.-]+)', line)
                cm_match = re.search(r'CMTOT\(VFP\)=\s*([\d.-]+)', line)
                area_match = re.search(r'WING AREA\(TOTAL\)=\s*([\d.-]+)', line)

                level['vfpCoefficients'] = {
                    'CL': float(cl_match.group(1)) if cl_match else None,
                    'CD': float(cd_match.group(1)) if cd_match else None,
                    'CM': float(cm_match.group(1)) if cm_match else None
                }

                level['wingArea'] = float(area_match.group(1)) if area_match else None
                level['coefficients'] = level['vfpCoefficients']
                continue

            if 'CLTOT(IBE)' in line:
                cl_match = re.search(r'CLTOT\(IBE\)=\s*([\d.-]+)', line)
                cd_match = re.search(r'CDTOT\(IBE\)=\s*([\d.-]+)', line)

                level['ibeCoefficients'] = {
                    'CL': float(cl_match.group(1)) if cl_match else None,
                    'CD': float(cd_match.group(1)) if cd_match else None
                }
                continue

            if 'CL(vortd)' in line:
                cl_match = re.search(r'CL\(vortd\)\s*=\s*([\d.-]+)', line)
                cd_match = re.search(r'CD\(vortd\)\s*=\s*([\d.-]+)', line)
                dcd_match = re.search(r'DCD\(vortd\)\s*=\s*([\d.-]+)', line)

                level['vortexCoefficients'] = {
                    'CL': float(cl_match.group(1)) if cl_match else None,
                    'CD': float(cd_match.group(1)) if cd_match else None,
                    'DCD': float(dcd_match.group(1)) if dcd_match else None
                }
                continue

            if 'LEV=' in line:
                break

        # Find viscous drag data
        for i in range(header_index, len(lines)):
            line = lines[i].strip()
            if '***************** VISCOUS DRAG DATA *****************' in line:
                level['viscousDragData'] = parse_viscous_drag_data(lines, i)
                break
            if 'LEV=' in line:
                break

        return level

    # Parse all levels
    for i in range(len(lines)):
        line = lines[i].strip()
        if 'LEV=' in line:
            level = parse_level(lines, i)
            if level:
                level_number = level['level']
                level_key = f'level{level_number}'
                forces_data['levels'][level_key] = level

    return forces_data




def readCP(filename):
    """
    Read CP file and return structured data in JSON format
    """
    with open(filename, 'r') as f:
        content = f.read()
    
    lines = content.split('\n')

    cp_data = {
        'fileName': filename,
        'metadata': {
            'totalLines': len(lines),
            'parsedAt': None  # Will be set if needed
        },
        'simulationMetadata': None,
        'levels': {}
    }

    line_index = 0

    # Skip empty lines at the beginning
    while line_index < len(lines) and not lines[line_index].strip():
        line_index += 1

    # First non-empty line: simulation metadata
    if line_index < len(lines):
        cp_data['simulationMetadata'] = lines[line_index].strip()
        line_index += 1

    # Parse levels
    while line_index < len(lines):
        line = lines[line_index].strip()

        if line.startswith('LEV= '):
            # Extract level number from flowParameters line
            level_match = re.search(r'LEV=\s*(\d+)', line)
            if level_match:
                level_number = int(level_match.group(1))
                level_key = f'level{level_number}'
            else:
                level_key = f'level{len(cp_data["levels"]) + 1}'

            level = {
                'flowParameters': line,
                'sections': {}
            }

            line_index += 1

            # Parse sections within this level
            while line_index < len(lines):
                # Skip empty lines
                while line_index < len(lines) and not lines[line_index].strip():
                    line_index += 1

                if line_index >= len(lines):
                    break

                section_line = lines[line_index].strip()

                # Check if we've reached the next level
                if section_line.startswith('LEV= '):
                    line_index -= 1
                    break

                # Check for section header
                if section_line.startswith('J= '):
                    # Extract section number from sectionHeader line
                    section_match = re.search(r'J=\s*(\d+)', section_line)
                    if section_match:
                        section_number = int(section_match.group(1))
                        section_key = f'section{section_number}'
                    else:
                        section_key = f'section{len(level["sections"]) + 1}'

                    section = {
                        'sectionHeader': section_line,
                        'X/C': [],
                        'Z/C': [],
                        'CP': [],
                        'P/H': [],
                        'M': [],
                        'Q': [],
                        'PHI(I=L)': [],
                        'Y/YTIP': [],
                        'XPHYS': [],
                        'ZPHYS': [],
                        'VT': [],
                        'VALP': [],
                        'vortexWake': {
                            'X/C': [],
                            'Z/C': [],
                            'CP_upper': [],
                            'P/H_upper': [],
                            'M_upper': [],
                            'Q_upper': [],
                            'CP_lower': [],
                            'P/H_lower': [],
                            'M_lower': [],
                            'Q_lower': []
                        },
                        'coefficients': {}
                    }

                    # Parse coefficient values from section header
                    yave_match = re.search(r'YAVE=\s*([\d.-]+)', section_line)
                    cl_match = re.search(r'CL=\s*([\d.-]+)', section_line)
                    cd_match = re.search(r'CD=\s*([\d.-]+)', section_line)
                    cm_match = re.search(r'CM=\s*([\d.-]+)', section_line)
                    chord_match = re.search(r'CHORD=\s*([\d.-]+)', section_line)
                    twist_match = re.search(r'TWIST=\s*([\d.-]+)', section_line)
                    gam_match = re.search(r'GAM=\s*([\d.-]+)', section_line)

                    if yave_match:
                        section['coefficients']['YAVE'] = float(yave_match.group(1))
                    if cl_match:
                        section['coefficients']['CL'] = float(cl_match.group(1))
                    if cd_match:
                        section['coefficients']['CD'] = float(cd_match.group(1))
                    if cm_match:
                        section['coefficients']['CM'] = float(cm_match.group(1))
                    if chord_match:
                        section['coefficients']['CHORD'] = float(chord_match.group(1))
                    if twist_match:
                        section['coefficients']['TWIST'] = float(twist_match.group(1))
                    if gam_match:
                        section['coefficients']['GAM'] = float(gam_match.group(1))

                    line_index += 1

                    # Skip empty lines until we reach the main table
                    while line_index < len(lines) and not lines[line_index].strip():
                        line_index += 1

                    # Define the expected column order for main table
                    main_table_columns = ['X/C', 'Z/C', 'CP', 'P/H', 'M', 'Q', 'PHI(I=L)', 'Y/YTIP', 'XPHYS', 'ZPHYS', 'VT', 'VALP']
                    
                    # Read main table header line
                    if line_index < len(lines) and any(col in lines[line_index] for col in ['X/C', 'Z/C', 'CP']):
                        line_index += 1  # Skip header line
                    
                    # Read main table data
                    while line_index < len(lines):
                        data_line = lines[line_index].strip()

                        if not data_line:
                            break

                        # Check if we've reached the vortex sheet header or next section
                        if ('UPPER SURFACE OF VORTEX SHEET' in data_line or 
                            'LOWER SURFACE OF VORTEX SHEET' in data_line or
                            data_line.startswith('J= ') or 
                            data_line.startswith('LEV= ')):
                            break

                        values = data_line.split()
                        if values:
                            # Skip any remaining header-like lines
                            if any(val.replace('.', '').replace('-', '').replace('+', '').replace('e', '').replace('E', '').isalpha() for val in values if len(val) > 1):
                                line_index += 1
                                continue

                            # Process data rows - only take first 12 values for main table
                            for i, value in enumerate(values[:12]):
                                if i < len(main_table_columns):
                                    try:
                                        section[main_table_columns[i]].append(float(value))
                                    except (ValueError, IndexError):
                                        section[main_table_columns[i]].append(value)

                        line_index += 1

                    # Skip empty lines and look for vortex wake header
                    while line_index < len(lines) and not lines[line_index].strip():
                        line_index += 1

                    # Skip vortex sheet header line if present
                    if (line_index < len(lines) and 
                        ('UPPER SURFACE OF VORTEX SHEET' in lines[line_index] or 
                         'LOWER SURFACE OF VORTEX SHEET' in lines[line_index])):
                        line_index += 1

                    # Skip vortex wake table header line if present
                    if (line_index < len(lines) and 
                        any(col in lines[line_index] for col in ['X/C', 'Z/C', 'CP', 'P/H'])):
                        line_index += 1

                    # Read vortex wake table data
                    vortex_wake_columns = ['X/C', 'Z/C', 'CP_upper', 'P/H_upper', 'M_upper', 'Q_upper', 'CP_lower', 'P/H_lower', 'M_lower', 'Q_lower']
                    
                    while line_index < len(lines):
                        vortex_data_line = lines[line_index].strip()

                        if (vortex_data_line.startswith('J= ') or 
                            vortex_data_line.startswith('LEV= ') or 
                            not vortex_data_line):
                            break

                        vortex_values = vortex_data_line.split()
                        if len(vortex_values) >= 10:  # Should have 10 columns for vortex wake
                            # Process vortex wake data
                            for i, value in enumerate(vortex_values[:10]):
                                if i < len(vortex_wake_columns):
                                    try:
                                        section['vortexWake'][vortex_wake_columns[i]].append(float(value))
                                    except (ValueError, IndexError):
                                        section['vortexWake'][vortex_wake_columns[i]].append(value)

                        line_index += 1

                    level['sections'][section_key] = section
                else:
                    line_index += 1

            cp_data['levels'][level_key] = level
        else:
            line_index += 1

    return cp_data


def readVIS(filename):
    """
    Read VIS file and return structured data in JSON format
    """
    with open(filename, 'r') as f:
        content = f.read()
    
    lines = content.split('\n')

    vis_data = {
        'fileName': filename,
        'metadata': {
            'totalLines': len(lines),
            'parsedAt': None
        },
        'simulationMetadata': None,
        'levels': {}
    }

    line_index = 0

    # Skip empty lines at the beginning
    while line_index < len(lines) and not lines[line_index].strip():
        line_index += 1

    # First non-empty line: simulation metadata
    if line_index < len(lines):
        vis_data['simulationMetadata'] = lines[line_index].strip()
        # DON'T increment line_index here - let the level parsing handle this line

    # Parse levels
    while line_index < len(lines):
        line = lines[line_index].strip()

        # Check for level header with PHI RETRIEVED LEV=
        if 'PHI RETRIEVED LEV=' in line:
            # Extract level number
            level_match = re.search(r'LEV=\s*(\d+)', line)
            if level_match:
                level_number = int(level_match.group(1))
                level_key = f'level{level_number}'
            else:
                level_key = f'level{len(vis_data["levels"]) + 1}'

            level = {
                'levelHeader': line,
                'machNumber': None,
                'incidence': None,
                'reynoldsNumber': None,
                'sections': {}
            }

            line_index += 1

            # Parse flow parameters (MACH NUMBER, INCIDENCE, REYNOLDS NUMBER)
            for param_name in ['MACH NUMBER', 'INCIDENCE', 'REYNOLDS NUMBER']:
                while line_index < len(lines):
                    param_line = lines[line_index].strip()
                    if param_name in param_line:
                        # Extract value after ":"
                        colon_split = param_line.split(':')
                        if len(colon_split) > 1:
                            try:
                                value = float(colon_split[1].strip())
                                if param_name == 'MACH NUMBER':
                                    level['machNumber'] = value
                                elif param_name == 'INCIDENCE':
                                    level['incidence'] = value
                                elif param_name == 'REYNOLDS NUMBER':
                                    level['reynoldsNumber'] = value
                            except ValueError:
                                pass
                        line_index += 1
                        break
                    line_index += 1

            # Parse sections within this level
            while line_index < len(lines):
                # Skip empty lines
                while line_index < len(lines) and not lines[line_index].strip():
                    line_index += 1

                if line_index >= len(lines):
                    break

                section_line = lines[line_index].strip()

                # Check if we've reached the next level
                if 'PHI RETRIEVED LEV=' in section_line:
                    line_index -= 1
                    break

                # Check for section header (Span j-2 = ...)
                if section_line.startswith('Span j-2'):
                    # Extract section parameters
                    span_match = re.search(r'Span j-2\s*=\s*(\d+)', section_line)
                    eta_match = re.search(r'eta\s*=\s*([\d.-]+)', section_line)
                    chord_match = re.search(r'Chord\s*=\s*([\d.-]+)', section_line)

                    if span_match:
                        section_number = int(span_match.group(1))
                        section_key = f'section{section_number}'
                    else:
                        section_key = f'section{len(level["sections"]) + 1}'

                    section = {
                        'sectionHeader': section_line,
                        'spanJ2': int(span_match.group(1)) if span_match else None,
                        'eta': float(eta_match.group(1)) if eta_match else None,
                        'chord': float(chord_match.group(1)) if chord_match else None,
                        'I': [],
                        'x/c': [],
                        'Cp': [],
                        'Uinv': [],
                        'Uvis': [],
                        'Theta/c': [],
                        'Dis/c': [],
                        'H': [],
                        'Cf': [],
                        'V/Ue': [],
                        'Flow-Ang': [],
                        'Beta': [],
                        'Vn': [],
                        'DVn': []
                    }

                    line_index += 1

                    # Skip empty lines until we reach the data table
                    while line_index < len(lines) and not lines[line_index].strip():
                        line_index += 1

                    # Skip table header line if present
                    if (line_index < len(lines) and 
                        any(col in lines[line_index] for col in ['I', 'x/c', 'Cp', 'Uinv'])):
                        line_index += 1

                    # Define the expected column order
                    table_columns = ['I', 'x/c', 'Cp', 'Uinv', 'Uvis', 'Theta/c', 'Dis/c', 'H', 'Cf', 'V/Ue', 'Flow-Ang', 'Beta', 'Vn', 'DVn']
                    
                    # Read table data
                    while line_index < len(lines):
                        data_line = lines[line_index].strip()

                        if not data_line:
                            break

                        # Check if we've reached the next section or level
                        if (data_line.startswith('Span j-2') or 
                            'PHI RETRIEVED LEV=' in data_line):
                            line_index -= 1
                            break

                        values = data_line.split()
                        if len(values) >= 14:  # Should have 14 columns
                            # Process data rows
                            for i, value in enumerate(values[:14]):
                                if i < len(table_columns):
                                    try:
                                        section[table_columns[i]].append(float(value))
                                    except (ValueError, IndexError):
                                        section[table_columns[i]].append(value)

                        line_index += 1

                    level['sections'][section_key] = section
                else:
                    line_index += 1

            vis_data['levels'][level_key] = level
        else:
            line_index += 1

    return vis_data



def readMAP(filename):
    """
    Read MAP file and return structured data in JSON format
    """
    with open(filename, 'r') as f:
        content = f.read()
    
    lines = content.split('\n')

    map_data = {
        'fileName': filename,
        'metadata': {
            'totalLines': len(lines),
            'parsedAt': None
        },
        'title': None,
        'parameters': {}
    }

    # Filter out empty lines and format description section
    filtered_lines = []
    skip_format_section = False
    
    for line in lines:
        line = line.strip()
        
        # Start skipping when we encounter "LINE: FORMAT:"
        if line.startswith('LINE: FORMAT:'):
            skip_format_section = True
            continue
            
        # Skip all lines after "LINE: FORMAT:"
        if skip_format_section:
            continue
            
        # Only include non-empty lines that are not in format section
        if line:
            filtered_lines.append(line)

    # Process pairs of lines (key line, value line)
    i = 0
    while i < len(filtered_lines) - 1:
        key_line = filtered_lines[i]
        value_line = filtered_lines[i + 1]

        # Remove line number comments (e.g., #2, #3, etc.)
        key_line = re.sub(r'#\d+$', '', key_line).strip()
        value_line = re.sub(r'#\d+$', '', value_line).strip()

        # Handle the title (first pair)
        if 'TITLE FOR VFP MAPPING RUN:' in key_line:
            map_data['title'] = value_line
            i += 2
            continue

        # Parse parameter keys and values
        if key_line and value_line:
            # Split the key line to get parameter names
            keys = key_line.split()
            # Split the value line to get corresponding values
            values = value_line.split()

            # Map keys to values
            for j, key in enumerate(keys):
                if j < len(values):
                    value = values[j]
                    
                    # Try to convert to appropriate data type
                    try:
                        # Check if it's an integer
                        if '.' not in value and value.replace('-', '').isdigit():
                            map_data['parameters'][key] = int(value)
                        # Check if it's a float
                        elif value.replace('.', '').replace('-', '').replace('e', '').replace('E', '').replace('+', '').isdigit():
                            map_data['parameters'][key] = float(value)
                        # Keep as string for special cases like IOPT
                        else:
                            map_data['parameters'][key] = value
                    except ValueError:
                        # If conversion fails, keep as string
                        map_data['parameters'][key] = value

        i += 2  # Move to next pair

    return map_data

def test_and_print_json(func, filename):
    """
    Test a function with a file and print the JSON output
    """
    print(f"Testing {func.__name__} with file: {filename}")
    print("=" * 60)
    
    try:
        result = func(filename)
        json_output = json.dumps(result, indent=2, default=str)
        print(json_output)
        print("\n" + "=" * 60)
        print(f"✅ Successfully parsed {filename}")

        output_filename = f"{filename}_output.json"
        with open(output_filename, 'w') as out_file:
            out_file.write(json_output) 
        
    except Exception as e:
        print(f"❌ Error: {e}")
        print("=" * 60)




def mergeVFPData(*json_objects, **named_json_objects):
    """
    Merge multiple VFP JSON objects into a single consolidated JSON structure
    
    Args:
        *json_objects: Variable number of JSON objects with 'fileName' to auto-detect type
        **named_json_objects: Named JSON objects where key is the file type
                             e.g., geo=geo_json, map=map_json, flow=flow_json
    
    Returns:
        dict: Consolidated JSON with file type as keys
    """
    
    consolidated_data = {
        'metadata': {
            'mergedAt': None,
            'sourceFiles': {},
            'totalFiles': 0
        },
        'data': {}
    }
    
    def detect_file_type_from_filename(json_obj):
        """Detect file type from fileName extension"""
        if not isinstance(json_obj, dict):
            return None
            
        filename = json_obj.get('fileName', '').lower()
        
        # Extract file extension and map to file type
        if filename.endswith('.geo'):
            return 'geo'
        elif filename.endswith('.map'):
            return 'map'
        elif filename.endswith('.dat'):
            return 'flow'
        elif filename.endswith('.forces'):
            return 'forces'
        elif filename.endswith('.cp'):
            return 'cp'
        elif filename.endswith('.vis'):
            return 'vis'
        
        return None
    
    successful_files = 0
    
    # Process named arguments first (explicit file types)
    for file_type, json_obj in named_json_objects.items():
        if isinstance(json_obj, dict):
            consolidated_data['data'][file_type.lower()] = json_obj
            filename = json_obj.get('fileName', f'Unknown {file_type} file')
            consolidated_data['metadata']['sourceFiles'][file_type.lower()] = filename
            successful_files += 1
            print(f"✅ Added {file_type.upper()} data: {filename}")
        else:
            print(f"❌ Invalid JSON object for {file_type}")
    
    # Process positional arguments (auto-detect file types using fileName)
    for json_obj in json_objects:
        if isinstance(json_obj, dict):
            file_type = detect_file_type_from_filename(json_obj)
            if file_type:
                # Don't overwrite if already exists from named arguments
                if file_type not in consolidated_data['data']:
                    consolidated_data['data'][file_type] = json_obj
                    filename = json_obj.get('fileName', f'Unknown {file_type} file')
                    consolidated_data['metadata']['sourceFiles'][file_type] = filename
                    successful_files += 1
                    print(f"✅ Auto-detected and added {file_type.upper()} data: {filename}")
                else:
                    filename = json_obj.get('fileName', 'Unknown file')
                    print(f"⚠️  {file_type.upper()} data already exists, skipping: {filename}")
            else:
                filename = json_obj.get('fileName', 'Unknown file')
                print(f"❌ Could not detect file type for: {filename}")
        else:
            print(f"❌ Invalid JSON object provided")
    
    consolidated_data['metadata']['totalFiles'] = successful_files
    
    return consolidated_data


def saveConsolidatedJSON(consolidated_data, output_filename):
    """
    Save consolidated VFP data to a JSON file
    
    Args:
        consolidated_data (dict): Output from mergeVFPData
        output_filename (str): Output JSON filename
    """
    try:
        with open(output_filename, 'w') as f:
            json.dump(consolidated_data, f, indent=2, default=str)
        print(f"💾 Consolidated data saved to: {output_filename}")
    except Exception as e:
        print(f"❌ Error saving consolidated data: {e}")




# Test functions (optional)
# if __name__ == "__main__":
    # Test the functions with sample files if available
    # test_and_print_json(readFLOW, 'M033Re12p0ma+0p00.dat')
    # test_and_print_json(readCP, 'CRM1wbsM085Re5ma0p0.cp')
    # test_and_print_json(readVIS, 'CRM1wbsM085Re5ma0p0.vis')
    # test_and_print_json(readMAP, 'CRM1wb.map')
 
    # Read individual files first
    # geo_json = readGEO('CRM1wbs.GEO')
    # map_json = readMAP('CRM1wb.map')
    # flow_json = readFLOW('M085Re5p0ma+0p0.dat')
    # forces_json = readFORCE('CRM1wbsM085Re5ma0p0.forces')
    # cp_json = readCP('CRM1wbsM085Re5ma0p0.cp')
    # vis_json = readVIS('CRM1wbsM085Re5ma0p0.vis')

    # # Merge them - auto-detection based on fileName
    # consolidated = mergeVFPData(geo_json, map_json, flow_json, forces_json, cp_json, vis_json)
    # saveConsolidatedJSON(consolidated, 'consolidated_vfp_data.json')
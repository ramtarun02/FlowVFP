import numpy as np
from scipy.interpolate import interp1d
from flask import jsonify
import math

def readGEO(filename):
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

    return Sections

def interpolate_airfoil(airfoil_points, num_points=10000):
    """
    Perform linear interpolation on airfoil points where x is strictly increasing.
    
    Parameters:
    - airfoil_points: List of [x,y] coordinates of the original airfoil points
    - num_points: Desired number of points in the interpolated airfoil (default: 10000)
    
    Returns:
    - interpolated_points: Numpy array of interpolated [x,y] coordinates
    """
    # Convert to numpy array and separate x and y coordinates
    points = np.array(airfoil_points)
    x = points[:, 0]
    y = points[:, 1]
    
    # # Verify x is strictly increasing
    # if not np.all(np.diff(x) > 0):
    #     raise ValueError("x-coordinates must be strictly increasing for this interpolation method")
    
    # Create linear interpolation function for y coordinates
    fy = interp1d(x, y, kind='linear')
    
    # Generate new equally spaced x values
    x_new = np.linspace(x.min(), x.max(), num_points)
    
    # Calculate interpolated y values
    y_new = fy(x_new)
    
    x_new = x_new.tolist()
    y_new = y_new.tolist()
    # Combine into array of [x,y] points
    interpolated_points = np.column_stack((x_new, y_new))
    
    return interpolated_points, x_new, y_new

import math
from typing import List, Dict, Tuple, Any

def airfoils(Sect: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Process airfoil section data with coordinate transformation and aerodynamic calculations.
    
    Args:
        Sect: List of section dictionaries containing 'US', 'LS', 'G1SECT', 'G2SECT', 'YSECT'
        
    Returns:
        List of processed airfoil data dictionaries
    """
    Sect2 = Sect.copy()  # Make a copy to avoid modifying original data
    
    # Check if all sections have US and LS starting with (0, 0)
    if all(s['US'][0][0] == 0 and s['LS'][0][0] == 0 for s in Sect2):
        # Perform coordinate transformation for all sections
        for s in Sect2:
            chord_length = s['G2SECT'] - s['G1SECT']
            s['US'] = [(x * chord_length + s['G1SECT'], y * chord_length) 
                      for x, y in s['US']]
            s['LS'] = [(x * chord_length + s['G1SECT'], y * chord_length) 
                      for x, y in s['LS']]

    Points = []

    try:
        for s in Sect2:
            # Interpolate airfoil surfaces
            _, xus, zus = interpolate_airfoil(s['US'], num_points=10000)
            _, xls, zls = interpolate_airfoil(s['LS'], num_points=10000)

            # Check if normalized coordinates exist and interpolate them too
            xus_n, zus_n, xls_n, zls_n = [], [], [], []
            if all(key in s for key in ['XUS_N', 'ZUS_N', 'XLS_N', 'ZLS_N']):
                # Create coordinate pairs for interpolation
                us_n_coords = list(zip(s['XUS_N'], s['ZUS_N']))
                ls_n_coords = list(zip(s['XLS_N'], s['ZLS_N']))
                
                # Interpolate normalized coordinates
                _, xus_n, zus_n = interpolate_airfoil(us_n_coords, num_points=10000)
                _, xls_n, zls_n = interpolate_airfoil(ls_n_coords, num_points=10000)

            # Create y-coordinates (constant for each section)
            y = [s['YSECT']] * len(xls)

            # Calculate aerodynamic properties
            chord_length = s['G2SECT'] - s['G1SECT']
            
            # Maximum thickness and thickness-to-chord ratio
            thickness_distribution = [zus[i] - zls[i] for i in range(len(zus))]
            t_max = max(thickness_distribution)
            t_c = t_max / chord_length if chord_length != 0 else 0
            
            # Calculate aerodynamic properties
            chord_length = s['G2SECT'] - s['G1SECT']
            
            # Maximum thickness and thickness-to-chord ratio
            thickness_distribution = [zus[i] - zls[i] for i in range(len(zus))]
            t_max = max(thickness_distribution)
            t_c = t_max / chord_length if chord_length != 0 else 0
            
            # Camber line (mean line between upper and lower surfaces)
            camber = [(zus[i] + zls[i]) / 2 for i in range(len(zus))]
            
            # Twist calculation based on leading/trailing edge height difference
            z_diff = abs(zus[0] - zus[-1])
            x_diff = chord_length
            twist = (math.degrees(math.atan(z_diff / x_diff)) if x_diff != 0 else 0) * (-1 if zus[0] < zus[-1] else 1)
            
            # Append processed data to Points array
            Points.append({
                'y': y, 
                'xus': xus, 
                'zus': zus, 
                'xls': xls, 
                'zls': zls,
                't_c': t_c, 
                'camber': camber, 
                'twist': twist, 
                'xus_n': xus_n, 
                'zus_n': zus_n, 
                'xls_n': xls_n, 
                'zls_n': zls_n
            })

        return Points
 
    except ValueError as e:
        print(f"Error: {e}")
        return []
    except Exception as e:
        print(f"Unexpected error: {e}")
        return []
    

def writeGEO(filename, sections, xrad=None, rad=None):
    """
    Write GEO file from structured data
    
    Args:
        filename: Output filename
        sections: List of section dictionaries (from readGEO)
        xrad: List of XRAD values (optional)
        rad: List of RAD values (optional)
    """
    with open(filename, 'w') as f:
        # Hardcoded Line type 1 parameters
        # Format: 2I5, 4(I5,F10.0)
        line1_params = {
            'NSECT': len(sections),
            'NSECT1': 2,  # Typically same as NSECT if no special handling
            'ISEND': [-1, -1, -1, -1],  # Example interpolation parameters
            'DSEND': [0.0, 0.0, 0.0, 0.0]  # Example delta parameters
        }
        
        # Write Line type 1
        line1 = f"  {line1_params['NSECT']:3d}{line1_params['NSECT1']:5d}"
        for i in range(4):
            line1 += f"{line1_params['ISEND'][i]:5d}{line1_params['DSEND'][i]:10.5f}"
        f.write(line1 + '\n')
        
        # Write sections
        for section in sections:
            # Line type 2: 4F10.0
            line2 = f"{section['YSECT']:10.6f}{section['G1SECT']:10.6f}" \
                   f"{section['G2SECT']:10.6f}{section['HSECT']:10.6f}"
            f.write(line2 + '\n')
            
            # Line type 3: 3I5, 2F10.0
            line3 = f"  {section['IMARK']:3d}{section['MU']:5d}{section['ML']:5d}" \
                   f"{section['XTWSEC']:10.6f}{section['TWIST']:10.6f}"
            f.write(line3 + '\n')
            
            # Line type 4 coordinates - Upper surface first
            for x, z in section['US']:
                line4 = f"{x:10.6f}{z:10.6f}"
                f.write(line4 + '\n')
            
            # Lower surface if not symmetrical (IMARK == 0)
            if section['IMARK'] == 0:
                for x, z in section['LS']:
                    line4 = f"{x:10.6f}{z:10.6f}"
                    f.write(line4 + '\n')
        
        # Write body data if provided
        if xrad is not None and rad is not None and len(xrad) > 0:
            # Hardcoded Line type 5 parameters
            line5_params = {
                'NRAD': len(xrad),
                'IREND': [1, 2],  # Example interpolation parameters
                'DREND': [0.0, 0.0]  # Example delta parameters
            }
            
            # Line type 5: I5, 2(I5, F10.0)
            line5 = f"{line5_params['NRAD']:5d}"
            for i in range(2):
                line5 += f"{line5_params['IREND'][i]:5d}{line5_params['DREND'][i]:10.4f}"
            f.write(line5 + '\n')
            
            # Line type 6 coordinates
            for x, r in zip(xrad, rad):
                line6 = f"{x:10.4f}{r:10.4f}"
                f.write(line6 + '\n')

        else:
            # Write default ending lines when no xrad/rad data
            f.write("   0\n")
            f.write("\n")
            f.write("\n")
            f.write("\n")
            f.write("\n")
            f.write("     0    0       0.0    0       0.0\n")



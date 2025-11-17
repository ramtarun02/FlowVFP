import numpy as np
import math
from readVFP import readCP
from tkinter import Tk, filedialog

def parse_float_from_str(s, key):
    import re
    match = re.search(rf"{key}=\s*([-\d\.]+)", s)
    return float(match.group(1)) if match else 0.0

def biot_savart(vortex_start, vortex_end, control_point):
    r1 = control_point - vortex_start
    r2 = control_point - vortex_end
    r0 = vortex_end - vortex_start
    cross = np.cross(r1, r2)
    norm_cross = np.linalg.norm(cross)
    if norm_cross < 1e-8:
        return np.zeros(3)
    denom = norm_cross**2
    r1_len = np.linalg.norm(r1)
    r2_len = np.linalg.norm(r2)
    diff = r1 / r1_len - r2 / r2_len
    velocity = cross / (4 * np.pi * denom) * np.dot(r0, diff)
    return velocity

def main():
    # Browse for cp file
    Tk().withdraw()
    cp_path = filedialog.askopenfilename(title="Select .cp file", filetypes=[("CP files", "*.cp")])
    if not cp_path:
        print("No file selected.")
        return

    cp_json = readCP(cp_path)
    level_key = next(iter(cp_json['levels']))
    level = cp_json['levels'][level_key]
    sections = list(level['sections'].values())
    N = len(sections)
    b = sections[-1]['coefficients']['YAVE']
    chord = [parse_float_from_str(sec['sectionHeader'], "CHORD") for sec in sections]
    twist = [parse_float_from_str(sec['sectionHeader'], "TWIST") for sec in sections]
    y_stations = [sec['coefficients']['YAVE'] for sec in sections]
    flow_str = level['flowParameters']
    mach = parse_float_from_str(flow_str, "MACH NO")
    print(f"Mach Number: {mach}")
    alpha_wing = parse_float_from_str(flow_str, "ALPHA")
    print(f"Wing Angle of Attack: {alpha_wing} degrees")
    U_inf = mach * 340.29  # Approximate speed of sound in m/s
    print(f"Freestream Velocity: {U_inf:.2f} m/s")

    # Ask user for sweep angle
    sweep = 40

    # Build vortex lattice using actual geometry
    bound_vortices = []
    control_points = []
    trailing_ends = []
    wake_length = 100.0
    for i in range(N):
        y_bound = y_stations[i]
        x_quarter = 0.25 * chord[i] + y_bound * math.tan(math.radians(sweep))
        x_control = 0.75 * chord[i] + y_bound * math.tan(math.radians(sweep))
        bound_vortices.append(np.array([x_quarter, y_bound, 0.0]))
        control_points.append(np.array([x_control, y_bound, 0.0]))
        trailing_ends.append(np.array([wake_length, y_bound, 0.0]))

    # RHS vector for boundary conditions
    alpha_rad = math.radians(alpha_wing)
    twist_rad = np.radians(twist)
    b_vector = np.zeros(N)
    for i in range(N):
        effective_alpha = alpha_rad - twist_rad[i]
        b_vector[i] = U_inf * np.sin(effective_alpha)

    # Influence matrix
    A = np.zeros((N, N))
    for i, cp in enumerate(control_points):
        for j, bv in enumerate(bound_vortices):
            tv = trailing_ends[j]
            induced_vel = biot_savart(bv, tv, cp)
            A[i, j] = induced_vel[2]

    # Solve circulation strengths
    Gamma = np.linalg.solve(A, b_vector)

    # Tail points
    tail_x = max([0.75 * chord[i] + y_stations[i] * math.tan(math.radians(sweep)) for i in range(N)]) + 20.0
    tail_y = np.linspace(min(y_stations), max(y_stations), N)
    tail_points = [np.array([tail_x, y, 0.0]) for y in tail_y]

    # Calculate downwash at tail
    downwash_angles = []
    for tp in tail_points:
        w_induced = 0.0
        for gamma, bv, tv in zip(Gamma, bound_vortices, trailing_ends):
            vi = biot_savart(bv, tv, tp)
            w_induced += gamma * vi[2]
        downwash_angle = w_induced / U_inf
        downwash_angles.append(downwash_angle)

    avg_downwash_deg = np.degrees(np.mean(downwash_angles))
    print(f"Average Downwash Angle at Tail: {np.degrees(downwash_angle):.4f} degrees")
    print("Spanwise Downwash Distribution (deg):", np.degrees(downwash_angles))

if __name__ == "__main__":
    main()
import numpy as np
import matplotlib.pyplot as plt
from matplotlib import cm
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
from modules.vfp_processing.readVFP import readCP as cp
from modules.vfp_processing.readVFP import readGEO as geo

def parse_tail_input(tailflowInput):
    """
    Parse the fixed-format .tail input file with user-friendly comments.
    Returns a dictionary of parameters.
    """
    params = {}
    with open(tailflowInput, 'r') as f:
        # Remove comments and blank lines
        lines = [line.strip() for line in f if line.strip() and not line.strip().startswith('#')]
    idx = 0
    # First non-comment line is TITLE
    if idx < len(lines):
        params['TITLE'] = lines[idx]
        idx += 1
    # Parse parameter blocks: acronym line, then value line
    while idx < len(lines):
        key_line = lines[idx]
        idx += 1
        if idx >= len(lines):
            break
        val_line = lines[idx]
        idx += 1
        keys = key_line.split()
        vals = val_line.split()
        for k, v in zip(keys, vals):
            try:
                params[k] = float(v)
            except ValueError:
                params[k] = v
    return params

def compute_downwash_LLT(cpFile, geoFile, tailflowInput, save_plots=False):
    """
    Compute downwash at the tail using LLT and horseshoe vortices.
    Args:
        cpFile: Path to VFP .cp file (wing pressure data)
        geoFile: Path to VFP .GEO file (tail geometry)
        tailflowInput: Path to fixed-format .tail input file
        save_plots: If True, saves plots to file; else, no plots are shown or saved
    Returns:
        Dictionary with results (downwash, CL, etc.)
    """
    # --- Read input parameters from .tail file ---
    params = parse_tail_input(tailflowInput)
    # Required parameters (with defaults if not present)
    Cl_VFP = params.get('CLVFP', 0.43796)
    wing_root_chord = params.get('CWING', 12.50)
    tail_root_chord = params.get('CTAIL', 6.45)
    rho_inf = params.get('RHO', 1.225)
    M_inf = params.get('MACH', 0.80)
    T_inf = params.get('TINF', 288.15)
    gamma_air = params.get('GAMMA', 1.4)
    R_air = params.get('R', 287.0)
    x_t = params.get('XT', 30.5)
    y_t = params.get('YT', 0.0)
    z_t = params.get('ZT', 1.80)
    L_trail = params.get('LTRAIL', 1000.0)
    eps = params.get('EPS', 1e-6)
    Lambda_c4_deg = params.get('LAMW', 35)
    tail_sweep_deg = params.get('LAMT', 41)

    Lambda_c4 = np.radians(Lambda_c4_deg)
    x_qc_root = 0.25 * wing_root_chord
    tail_sweep = np.radians(tail_sweep_deg)

    # --- Read wing cp data ---
    cpdata = cp(cpFile)
    sections = cpdata['levels']['level1']['sections']

    # --- Read tail geometry data ---
    geoData = geo(geoFile)
    ntail_half = geoData['NSECT']
    y_tail_half = [sec['YSECT'] for sec in geoData['sections']]
    y_tail = np.array([-y for y in reversed(y_tail_half)] + y_tail_half) * tail_root_chord
    z_tail = np.full_like(y_tail, z_t)
    xt_q = x_t + 0.25 * tail_root_chord
    x_tail = xt_q + np.abs(y_tail) * np.tan(tail_sweep)

    # --- Build wing arrays ---
    y = []
    c = []
    cl = []
    for sec in sections.values():
        coeffs = sec['coefficients']
        y.append(coeffs['YAVE'])
        c.append(coeffs['CHORD'])
        cl.append(coeffs['CL'])
    y_sections = np.array([-y_ for y_ in reversed(y)] + y) * wing_root_chord
    c_sections = np.array(list(reversed(c)) + c) * wing_root_chord
    cl_sections = np.array(list(reversed(cl)) + cl)
    sort_idx = np.argsort(y_sections)
    y_sections = y_sections[sort_idx]
    c_sections = c_sections[sort_idx]
    cl_sections = cl_sections[sort_idx]
    N = len(y_sections)

    def x_qc(y):
        return x_qc_root + np.abs(y) * np.tan(Lambda_c4)

    wing_x = [x_qc(y) for y in y_sections]
    b = np.ptp(y_sections)

    def chord(y):
        return np.interp(y, y_sections, c_sections)

    def estimate_area(y, c):
        return np.trapezoid(c, y)

    S = estimate_area(y_sections, c_sections)
    AR = b**2 / S

    a_inf = np.sqrt(gamma_air * R_air * T_inf)
    V_inf = M_inf * a_inf

    Gamma = 0.5 * V_inf * c_sections * cl_sections
    L_prime = rho_inf * V_inf * Gamma
    L_total = np.trapezoid(L_prime, y_sections)
    CL = L_total / (0.5 * rho_inf * V_inf**2 * S)

    # Panel boundaries (spanwise)
    y_ends = np.zeros(N + 1)
    y_ends[1:-1] = 0.5 * (y_sections[:-1] + y_sections[1:])
    y_ends[0]    = y_sections[0]  - 0.5 * (y_sections[1] - y_sections[0])
    y_ends[-1]   = y_sections[-1] + 0.5 * (y_sections[-1] - y_sections[-2])

    # Bound vortex endpoints
    A_bound = np.zeros((N, 3))
    B_bound = np.zeros((N, 3))
    for j in range(N):
        xA = x_qc(y_ends[j])
        xB = x_qc(y_ends[j+1])
        A_bound[j] = np.array([xA, y_ends[j],   0.0])
        B_bound[j] = np.array([xB, y_ends[j+1], 0.0])

    def biot_savart_segment(P, A, B, gamma):
        r1 = P - A
        r2 = P - B
        r0 = B - A
        r1xr2 = np.cross(r1, r2)
        r1xr2_norm2 = np.dot(r1xr2, r1xr2) + eps**2
        r1_norm = np.linalg.norm(r1) + eps
        r2_norm = np.linalg.norm(r2) + eps
        k = gamma / (4.0 * np.pi * r1xr2_norm2) * np.dot(r0, (r1 / r1_norm - r2 / r2_norm))
        return k * r1xr2

    def horseshoe_induced_velocity(P, j, Gamma_j):
        A_b = A_bound[j]
        B_b = B_bound[j]
        B_inf = B_b + np.array([L_trail, 0.0, 0.0])
        A_inf = A_b + np.array([L_trail, 0.0, 0.0])
        v_bound  = biot_savart_segment(P, A_b,   B_b,   Gamma_j)
        v_trail1 = biot_savart_segment(P, B_b,   B_inf, Gamma_j)
        v_trail2 = biot_savart_segment(P, A_inf, A_b,   Gamma_j)
        return v_bound + v_trail1 + v_trail2

    ntail = len(x_tail)
    epsilon_t_array = np.zeros(ntail)
    w_total_array = np.zeros(ntail)
    # --- New: Store local velocity vectors at tail points ---
    local_velocity_vectors = np.zeros((ntail, 3))
    local_velocity_magnitudes = np.zeros(ntail)
 
    for i in range(ntail):
        P_tail_i = np.array([x_tail[i], y_tail[i], z_tail[i]])
        v_ind_total = np.zeros(3)
        for j in range(N):
            v_ind_total += horseshoe_induced_velocity(P_tail_i, j, Gamma[j])
        w_total = v_ind_total[2]
        w_total_array[i] = w_total
        epsilon_t_array[i] = np.arctan2(w_total, V_inf+v_ind_total[0])
        # --- New: Local velocity vector at tail point ---
        V_local = np.array([V_inf, 0.0, w_total])
        local_velocity_vectors[i] = V_local
        local_velocity_magnitudes[i] = np.linalg.norm(V_local)
    epsilon_deg_array = np.degrees(epsilon_t_array)
    effective_epsilon_rad = np.trapezoid(epsilon_t_array, y_tail) / (y_tail[-1] - y_tail[0])
    effective_epsilon_deg = np.degrees(effective_epsilon_rad)
    epsilon  = 2 * Cl_VFP / (np.pi * AR * 0.75)
    epsilon_deg = np.degrees(epsilon)

    # --- New: Spanwise average local velocity vector and magnitude ---
    avg_local_velocity_vector = np.mean(local_velocity_vectors, axis=0)
    avg_local_velocity_magnitude = np.mean(local_velocity_magnitudes)
    avg_local_mach = avg_local_velocity_magnitude / a_inf



    results = {
        'CL': CL,
        'AR': AR,
        'S': S,
        'V_inf': V_inf,
        'Gamma': Gamma,
        'CL_LLT': CL,
        'y_sections': y_sections,
        'c_sections': c_sections,
        'x_tail': x_tail,
        'y_tail': y_tail,
        'z_tail': z_tail,
        'epsilon_deg_array': epsilon_deg_array,
        'effective_epsilon_deg': effective_epsilon_deg,
        'prandtl_epsilon_deg': epsilon_deg, 
        # --- New results ---
        'local_velocity_vectors': local_velocity_vectors,  # shape (ntail, 3)
        'local_velocity_magnitudes': local_velocity_magnitudes,  # shape (ntail,)
        'avg_local_velocity_vector': avg_local_velocity_vector,  # shape (3,)
        'avg_local_velocity_magnitude': avg_local_velocity_magnitude,   # scalar, 
        'avg_local_mach': avg_local_mach  # scalar
    }

    if save_plots:
        # 1. Planform visualization
        plt.figure(figsize=(10, 4))
        plt.plot([x_qc(y) for y in y_sections], y_sections, 'b-', label='Wing quarter-chord')
        plt.scatter([x_qc(y) for y in y_sections], y_sections, c='b', s=20)
        plt.plot(x_tail, y_tail, 'r-', label='Tail quarter-chord')
        plt.scatter(x_tail, y_tail, c='r', s=20)
        plt.xlabel('x [m]')
        plt.ylabel('y [m]')
        plt.title('Wing and Tail Planform (x-y view)')
        plt.axis('equal')
        plt.grid(True)
        plt.legend()
        plt.tight_layout()
        plt.savefig('planform.png')
        plt.close()

        # 2. Spanwise chord and Gamma
        fig1, ax1 = plt.subplots(2, 1, figsize=(6, 6), sharex=True)
        ax1[0].plot(y_sections, c_sections, marker='o')
        ax1[0].set_ylabel('Chord c(y) [m]')
        ax1[0].grid(True)
        ax1[1].plot(y_sections, Gamma, marker='o', color='r')
        ax1[1].set_xlabel('Spanwise y [m]')
        ax1[1].set_ylabel('Circulation Γ(y) [m²/s]')
        ax1[1].grid(True)
        fig1.suptitle('Spanwise chord and circulation distributions')
        plt.tight_layout()
        plt.savefig('chord_gamma.png')
        plt.close()

        # 3. 3D view of vortices and tail
        fig2 = plt.figure(figsize=(10, 7))
        ax2 = fig2.add_subplot(111, projection='3d')
        norm = plt.Normalize(Gamma.min(), Gamma.max())
        cmap = cm.viridis
        ax2.plot([x_qc(y) for y in y_sections], y_sections, np.zeros_like(y_sections), color='gray', alpha=0.7, linewidth=4, label='Lifting line')
        wing_half_thickness = 0.1
        wing_faces = []
        for i in range(len(y_sections) - 1):
            verts = [
                [x_qc(y_sections[i]),     y_sections[i],     -wing_half_thickness],
                [x_qc(y_sections[i+1]),   y_sections[i+1],   -wing_half_thickness],
                [x_qc(y_sections[i+1]),   y_sections[i+1],    wing_half_thickness],
                [x_qc(y_sections[i]),     y_sections[i],      wing_half_thickness]
            ]
            wing_faces.append(verts)
        wing_poly = Poly3DCollection(wing_faces, color='lightgray', alpha=0.3)
        ax2.add_collection3d(wing_poly)
        for j in range(N):
            x_vals = [A_bound[j,0], B_bound[j,0]]
            y_vals = [A_bound[j,1], B_bound[j,1]]
            z_vals = [A_bound[j,2], B_bound[j,2]]
            color = cmap(norm(Gamma[j]))
            ax2.plot(x_vals, y_vals, z_vals, color=color, linewidth=2)
            ax2.quiver(
                A_bound[j,0], A_bound[j,1], A_bound[j,2],
                B_bound[j,0]-A_bound[j,0], B_bound[j,1]-A_bound[j,1], B_bound[j,2]-A_bound[j,2],
                color=color, arrow_length_ratio=0.2, linewidth=1
            )
        for j in range(N):
            for bound in [A_bound[j], B_bound[j]]:
                bound_inf = bound + np.array([L_trail, 0.0, 0.0])
                ax2.plot([bound[0], bound_inf[0]], [bound[1], bound_inf[1]], [bound[2], bound_inf[2]], 'r--', alpha=0.7)
        ax2.scatter(x_tail, y_tail, z_tail, color='k', s=60, label='Tail points', zorder=10)
        ax2.set_xlim([np.min([x_qc(y) for y in y_sections])-5, np.max([x_qc(y) for y in y_sections])+5])
        ax2.set_ylim([np.min(y_sections)-2, np.max(y_sections)+2])
        ax2.set_zlim([-2, z_t + 2])
        ax2.view_init(elev=15, azim=-120)
        sm = cm.ScalarMappable(cmap=cmap, norm=norm)
        sm.set_array([])
        cbar = plt.colorbar(sm, ax=ax2, pad=0.1, shrink=0.7)
        cbar.set_label('Circulation Γ [m²/s]')
        ax2.set_xlabel('x [m]')
        ax2.set_ylabel('y [m]')
        ax2.set_zlabel('z [m]')
        ax2.set_title('Horseshoe vortex geometry and tail location')
        ax2.legend()
        plt.tight_layout()
        plt.savefig('horseshoe_3d.png')
        plt.close()

        # 4. Downwash angle distribution at tail
        sort_idx = np.argsort(y_tail)
        y_tail_sorted = y_tail[sort_idx]
        epsilon_deg_sorted = epsilon_deg_array[sort_idx]
        fig3, ax3 = plt.subplots(figsize=(7, 4))
        ax3.plot(y_tail_sorted, epsilon_deg_sorted, marker='o')
        ax3.set_xlabel('Tail spanwise position $y_t$ [m]')
        ax3.set_ylabel('Downwash angle $\\epsilon_t$ [deg]')
        ax3.set_title('Downwash angle distribution at tail')
        ax3.grid(True)
        plt.tight_layout()
        plt.savefig('downwash_tail.png')
        plt.close()

    return results

# Example usage:
# cpFile = r"C:\Users\Tarun.Ramprakash\Cranfield University\Davide Di Pasquale - VFP_Tarun\CRM_Wing_M080_Re5M\CRM1wbsM08Re5ma2p50.cp"
# geoFile= r"C:\Users\Tarun.Ramprakash\Cranfield University\Davide Di Pasquale - VFP_Tarun\CAD Geometry\NASA CRM\New Tail Geometry\VFP Tail 4\CRMHT4.GEO"
# tailinput = r"modules\vfp_processing\crmtail.tail"
# results = compute_downwash_LLT(cpFile, geoFile, tailinput, save_plots=False)
# print("Computed Results:")
# for key, value in results.items():
#     if isinstance(value, np.ndarray):
#         print(f"{key}: array of shape {value.shape}")
#     else:
#         print(f"{key}: {value}")
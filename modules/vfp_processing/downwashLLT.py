import numpy as np
import matplotlib.pyplot as plt
from matplotlib import cm
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
from readVFP import readCP as cp
from readVFP import readGEO as geo

# ============================================================
# 0. User Inputs and Options
# ============================================================

# File paths
cpFile = r"C:\Users\Tarun.Ramprakash\Cranfield University\Davide Di Pasquale - VFP_Tarun\CRM_Wing_M080_Re5M\CRM1wbsM08Re5ma3p00.cp"
geoFile = r"C:\Users\Tarun.Ramprakash\Cranfield University\Davide Di Pasquale - VFP_Tarun\CAD Geometry\NASA CRM\New Tail Geometry\VFP Tail 4\CRMHT4.GEO"

Cl_VFP = 0.43796  # Target lift coefficient from the VFP Wing case

# Wing and tail geometry
wing_root_chord = 12.50  # m
tail_root_chord = 6.45   # m

# Flight conditions
rho_inf = 1.225     # kg/m^3
M_inf  = 0.80
T_inf  = 288.15     # K
gamma_air = 1.4
R_air = 287.0       # J/(kg K)

# Tail location (global coordinates)
x_t = 30.5    # m (leading edge at root)
y_t = 0.0     # m
z_t = 1.80    # m

# Horseshoe trailing leg length and core radius
L_trail = 1000.0
eps = 1e-6

# Sweep angles
Lambda_c4_deg = 35        # quarter-chord sweep angle [deg] (wing)
Lambda_c4 = np.radians(Lambda_c4_deg)
x_qc_root = 0.25 * wing_root_chord  # x-location of quarter-chord at root
tail_sweep_deg = 41                # tail sweep [deg]
tail_sweep = np.radians(tail_sweep_deg)

# ============================================================
# 1. Read Data and Build Spanwise Arrays
# ============================================================

# --- Read wing cp data ---
cpdata = cp(cpFile)
sections = cpdata['levels']['level1']['sections']

# --- Read tail geometry data ---
geoData = geo(geoFile)
ntail_half = geoData['NSECT']
y_tail_half = [sec['YSECT'] for sec in geoData['sections']]
y_tail = np.array([-y for y in reversed(y_tail_half)] + y_tail_half) * tail_root_chord
z_tail = np.full_like(y_tail, z_t)

# Tail quarter-chord x-location (swept)
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

# Mirror for full span (assuming symmetry)
y_sections = np.array([-y_ for y_ in reversed(y)] + y) * wing_root_chord
c_sections = np.array(list(reversed(c)) + c) * wing_root_chord
cl_sections = np.array(list(reversed(cl)) + cl)

# Sort by spanwise coordinate
sort_idx = np.argsort(y_sections)
y_sections = y_sections[sort_idx]
c_sections = c_sections[sort_idx]
cl_sections = cl_sections[sort_idx]
N = len(y_sections)

# --- Wing quarter-chord x-location function (includes sweep) ---
def x_qc(y):
    return x_qc_root + np.abs(y) * np.tan(Lambda_c4)

# --- Quick planform visualization ---
plt.figure(figsize=(10, 4))
wing_x = [x_qc(y) for y in y_sections]
plt.plot(wing_x, y_sections, 'b-', label='Wing quarter-chord')
plt.scatter(wing_x, y_sections, c='b', s=20)
plt.plot(x_tail, y_tail, 'r-', label='Tail quarter-chord')
plt.scatter(x_tail, y_tail, c='r', s=20)
plt.xlabel('x [m]')
plt.ylabel('y [m]')
plt.title('Wing and Tail Planform (x-y view)')
plt.axis('equal')
plt.grid(True)
plt.legend()
plt.tight_layout()
plt.show()

# Wing span (assuming symmetry about y=0)
b = np.ptp(y_sections)
# b = 54.39  # Override with known value for CRM
print(f"Wing span b: {b:.3f} m")

# ============================================================
# 2. Chord Interpolation and Wing Area
# ============================================================

def chord(y):
    """Interpolated chord at spanwise location y."""
    return np.interp(y, y_sections, c_sections)

def estimate_area(y, c):
    """Estimate wing planform area by integrating chord distribution."""
    return np.trapezoid(c, y)

S = estimate_area(y_sections, c_sections)
AR = b**2 / S
print(f"Wing area S: {S:.3f} m^2")
print(f"Wing aspect ratio AR: {AR:.3f}")

# ============================================================
# 3. Freestream Speed from Mach Number
# ============================================================

a_inf = np.sqrt(gamma_air * R_air * T_inf)
V_inf = M_inf * a_inf
print(f"Freestream velocity V_inf: {V_inf:.3f} m/s")

# ============================================================
# 4. Circulation from Sectional CL
# ============================================================

# Gamma = 0.5 * V * c * c_l
Gamma = 0.5 * V_inf * c_sections * cl_sections  # [m^2/s]
L_prime = rho_inf * V_inf * Gamma               # Lift per unit span [N/m]
L_total = np.trapezoid(L_prime, y_sections)         # Total lift [N]
CL = L_total / (0.5 * rho_inf * V_inf**2 * S)
print(f"Approximate wing CL from given cl_sections: {CL:.4f}")

# ============================================================
# 5. Build Horseshoe Geometry
# ============================================================

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

# ============================================================
# 6. Biot–Savart Functions
# ============================================================

def biot_savart_segment(P, A, B, gamma):
    """
    Induced velocity at point P from vortex segment A->B of strength gamma.
    Uses desingularized Biot–Savart law for straight finite segment.
    """
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
    """
    Induced velocity at point P from horseshoe j of strength Gamma_j.
    Horseshoe = bound A_bound[j]->B_bound[j] + trailing legs.
    """
    A_b = A_bound[j]
    B_b = B_bound[j]
    # Trailing vortex endpoints aligned with freestream (x-direction)
    B_inf = B_b + np.array([L_trail, 0.0, 0.0])
    A_inf = A_b + np.array([L_trail, 0.0, 0.0])
    v_bound  = biot_savart_segment(P, A_b,   B_b,   Gamma_j)
    v_trail1 = biot_savart_segment(P, B_b,   B_inf, Gamma_j)
    v_trail2 = biot_savart_segment(P, A_inf, A_b,   Gamma_j)
    return v_bound + v_trail1 + v_trail2

# ============================================================
# 7. Compute Downwash at Tail (Distribution)
# ============================================================

ntail = len(x_tail)
epsilon_t_array = np.zeros(ntail)
w_total_array = np.zeros(ntail)

for i in range(ntail):
    P_tail_i = np.array([x_tail[i], y_tail[i], z_tail[i]])
    v_ind_total = np.zeros(3)
    for j in range(N):
        v_ind_total += horseshoe_induced_velocity(P_tail_i, j, Gamma[j])
    w_total = v_ind_total[2]
    w_total_array[i] = w_total
    epsilon_t_array[i] = np.arctan2(w_total, V_inf)

epsilon_deg_array = np.degrees(epsilon_t_array)

effective_epsilon_rad = np.trapezoid(epsilon_t_array, y_tail) / (y_tail[-1] - y_tail[0])
effective_epsilon_deg = np.degrees(effective_epsilon_rad)

print(f"Effective downwash angle at tail (span-averaged): {effective_epsilon_deg:.6f} deg")
epsilon  = 2* Cl_VFP / (np.pi * AR * 0.75)  # Prandtl's approximation with efficiency factor
epsilon_deg = np.degrees(epsilon)
print(f"Prandtl's approximation of downwash angle at tail: {epsilon_deg:.6f} deg")


# print("Tail downwash angle distribution (deg):")
# for y, eps in zip(y_tail, epsilon_deg_array):
#     print(f"y_t = {y:6.2f} m : epsilon_t = {eps: .6e} deg")

# ============================================================
# 8. Visualizations
# ============================================================

# 8.1 Spanwise chord and Gamma distributions
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
plt.show()

# 8.2 Advanced 3D view of bound vortices, trailing legs, and tail points
fig2 = plt.figure(figsize=(10, 7))
ax2 = fig2.add_subplot(111, projection='3d')

# Normalize circulation for color mapping
norm = plt.Normalize(Gamma.min(), Gamma.max())
cmap = cm.viridis

# Plot lifting line
ax2.plot(wing_x, y_sections, np.zeros_like(wing_x), color='gray', alpha=0.7, linewidth=4, label='Lifting line')

# Plot a thin rectangle to represent the wing surface
wing_half_thickness = 0.1  # meters, for visualization only
wing_faces = []
for i in range(len(wing_x) - 1):
    verts = [
        [wing_x[i],     y_sections[i],     -wing_half_thickness],
        [wing_x[i+1],   y_sections[i+1],   -wing_half_thickness],
        [wing_x[i+1],   y_sections[i+1],    wing_half_thickness],
        [wing_x[i],     y_sections[i],      wing_half_thickness]
    ]
    wing_faces.append(verts)
wing_poly = Poly3DCollection(wing_faces, color='lightgray', alpha=0.3)
ax2.add_collection3d(wing_poly)

# Plot bound vortices with color by circulation
for j in range(N):
    x_vals = [A_bound[j,0], B_bound[j,0]]
    y_vals = [A_bound[j,1], B_bound[j,1]]
    z_vals = [A_bound[j,2], B_bound[j,2]]
    color = cmap(norm(Gamma[j]))
    ax2.plot(x_vals, y_vals, z_vals, color=color, linewidth=2)
    # Add arrow for direction
    ax2.quiver(
        A_bound[j,0], A_bound[j,1], A_bound[j,2],
        B_bound[j,0]-A_bound[j,0], B_bound[j,1]-A_bound[j,1], B_bound[j,2]-A_bound[j,2],
        color=color, arrow_length_ratio=0.2, linewidth=1
    )

# Plot trailing legs from both ends of each horseshoe
for j in range(N):
    for bound in [A_bound[j], B_bound[j]]:
        bound_inf = bound + np.array([L_trail, 0.0, 0.0])
        ax2.plot([bound[0], bound_inf[0]], [bound[1], bound_inf[1]], [bound[2], bound_inf[2]], 'r--', alpha=0.7)

# Plot all tail points
ax2.scatter(x_tail, y_tail, z_tail, color='k', s=60, label='Tail points', zorder=10)

# Set axis limits and view
ax2.set_xlim([np.min(wing_x)-5, np.max(wing_x)+5])
ax2.set_ylim([np.min(y_sections)-2, np.max(y_sections)+2])
ax2.set_zlim([-2, z_t + 2])
ax2.view_init(elev=15, azim=-120)

# Colorbar for circulation
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
plt.show()

# 8.3 Downwash angle distribution at tail (sorted for plotting)
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
plt.show()

# FlowVFP — Viscous Full Potential Flow Solver

FlowVFP is a browser-based aerodynamic analysis application for transonic aircraft design. It provides an interactive web interface to the ESDU Viscous Full Potential (VFP) solver, replacing the legacy MATLAB/CLI workflow with a modern, collaborative, cross-platform solution.

**Live application:** [https://ramtarun02.github.io/VFP-2025](https://ramtarun02.github.io/VFP-2025)

---

## Table of Contents

- [FlowVFP — Viscous Full Potential Flow Solver](#flowvfp--viscous-full-potential-flow-solver)
  - [Table of Contents](#table-of-contents)
  - [What is FlowVFP?](#what-is-flowvfp)
  - [Who is it for?](#who-is-it-for)
    - [Advantages Over the Legacy VFP CLI / MATLAB GUI](#advantages-over-the-legacy-vfp-cli--matlab-gui)
  - [Application Modules](#application-modules)
    - [1. Geometry Module](#1-geometry-module)
    - [2. Solver Module](#2-solver-module)
    - [3. VFP-Post Module](#3-vfp-post-module)
    - [4. ProWiM Module](#4-prowim-module)
  - [Workflow — From Geometry to Results](#workflow--from-geometry-to-results)
  - [Getting Started](#getting-started)
    - [For End Users (No Installation Required)](#for-end-users-no-installation-required)
    - [For Local Development](#for-local-development)
      - [Prerequisites](#prerequisites)
      - [Step 1: Clone the Repository](#step-1-clone-the-repository)
      - [Step 2: Backend Setup (VFP-Python)](#step-2-backend-setup-vfp-python)
      - [Step 3: Frontend Setup (VFP-2025)](#step-3-frontend-setup-vfp-2025)
      - [Step 4: Verify the Setup](#step-4-verify-the-setup)
      - [Common Issues and Troubleshooting](#common-issues-and-troubleshooting)
      - [Development Workflow](#development-workflow)
      - [Additional Resources](#additional-resources)
  - [Wing Geometry File Format](#wing-geometry-file-format)
  - [Supported File Types](#supported-file-types)
  - [Example Case](#example-case)
  - [Repository Structure](#repository-structure)
  - [Deployment](#deployment)
  - [Security](#security)
  - [References](#references)
  - [Licence](#licence)

---

## What is FlowVFP?

The VFP (Viscous Full Potential) method is a transonic CFD technique developed by ESDU that couples a full-potential inviscid flow solver with a viscous boundary-layer correction. It is particularly suited for conceptual and preliminary aircraft wing design where rapid turnaround and reasonable accuracy are needed at transonic Mach numbers.

FlowVFP wraps this solver in a modern web application, enabling users to:

- **Import and edit wing geometry** interactively, with real-time 2D and 3D visualisation
- **Generate solver input files** (GEO, MAP, DAT) using the integrated FPCON tool
- **Run simulations** directly from the browser with live terminal output via WebSocket
- **Automate parameter sweeps** across angle-of-attack or Mach number ranges (AutoRunner)
- **Post-process results** — pressure coefficients (Cp), boundary-layer data, aerodynamic forces, wave drag, contour plots
- **Analyse propeller-wing interaction** using the ProWiM (Propeller-Wing Interaction Model) module
- **Export results** to Excel spreadsheets for reporting and further analysis

The solver itself is a set of Fortran executables (`vfphe.exe`, `visflow.exe`, `f137b1.exe`) that run on the server. The web application orchestrates file preparation, solver execution, and result extraction without requiring users to interact with command-line tools or manage file structures manually.

---

## Who is it for?

| Audience | How FlowVFP helps |
| --- | --- |
| **Aerospace engineers** in conceptual/preliminary design | Rapid aerodynamic analysis of wing configurations at transonic speeds without the overhead of full Navier-Stokes solvers |
| **Researchers** studying potential flow and boundary-layer effects | Interactive exploration of flow solutions, immediate feedback on geometry changes, easy parameter sweeps |
| **Students** learning CFD and aircraft design | Intuitive interface that abstracts CLI complexity; visual feedback reinforces theoretical understanding |
| **Design teams** | Multi-user, browser-based access from any OS; no per-seat licence fees; collaborative analysis sessions |

### Advantages Over the Legacy VFP CLI / MATLAB GUI

- **Cross-platform**: Runs in any modern browser — Windows, macOS, Linux
- **No local installation** for end users: access via a URL
- **Integrated FPCON**: Generate VFP input files without leaving the application
- **AutoRunner**: Automated continuation runs across AoA/Mach sweeps with Excel export
- **Real-time feedback**: Live solver output streamed to the browser
- **Modern visualisation**: Interactive Plotly charts, Three.js 3D models, D3 contour plots
- **No licensing costs**: Built on open-source technologies (React, Flask, Python)
- **Cloud-deployable**: Hosted on Azure App Service / GitHub Pages, ready for institutional servers

---

## Application Modules

FlowVFP is organised into four primary modules, each corresponding to a distinct phase of the aerodynamic design and analysis workflow.

### 1. Geometry Module

The Geometry Module is the entry point for any analysis. It allows users to define, inspect, and modify the 3D wing geometry used by the VFP solver.

**Key capabilities:**

- **Import .GEO files** — Upload one or multiple wing geometry files. Each file is parsed into section data and plotted instantly in 2D (planform, section profile, twist/dihedral distributions) and 3D (wireframe wing model).

- **Section-based editing (Compute Desired)** — Select any spanwise section and modify its parameters: twist angle, dihedral (HSECT), spanwise position (YSECT), leading-edge position, trailing-edge position, and chord length. Changes are computed on the server, and the updated geometry is reflected immediately in all plots. Twist modifications rotate section coordinates about the specified twist axis (XTWSEC).

- **Batch interpolation (Improve)** — Apply systematic variations to twist, dihedral, or leading-edge position across a range of wing sections using one of eight interpolation methods: linear, quadratic, elliptical, cosine, power, Schuemann, Hermite, or exponential. This enables rapid planform optimisation.

- **Wing specifications** — The module continuously computes and displays fundamental parameters: aspect ratio, reference span, planform area, taper ratio, sweep angles (leading edge, trailing edge, quarter chord), thickness-to-chord ratio, and section count.

- **Export .GEO files** — Download the modified geometry as a properly formatted .GEO file, ready for use in the Solver Module or external tools.

- **FPCON — Input file generation** — An integrated component that collects geometry parameters and aerodynamic conditions, then generates the three solver input files:
  - **Geometry file (.GEO)** — Wing section coordinates and planform definition
  - **Mapping file (.MAP)** — Computational grid mapping parameters
  - **Flow file (.DAT)** — Flight conditions (Mach number, angle of attack, Reynolds number, grid levels)

**Typical workflow:**

1. Import a .GEO file (or generate one via FPCON)
2. Inspect the wing in 2D/3D views
3. Modify sections or apply batch improvements
4. Export the final .GEO file
5. Proceed to the Solver Module

---

### 2. Solver Module

The Solver Module manages the setup, execution, and monitoring of VFP simulations.

**Key capabilities:**

- **Simulation setup** — Configure the simulation by specifying a simulation name, angle of attack, Mach number, and selecting the input files (wing GEO/MAP/DAT; optional tail GEO/MAP/DAT; optional body files).

- **Upload input files** — Drag-and-drop or browse to upload the required .GEO, .MAP, and .DAT files for wing and (optionally) tail configurations.

- **Run simulation** — Start the VFP solver with a single click. The solver output (convergence messages, iteration information, warnings) is streamed in real time to a terminal panel in the browser via WebSocket. No need to monitor a separate console window or SSH session.

- **Stop simulation** — Cancel a running simulation at any time. The server terminates the solver process tree immediately.

- **Three execution modes:**

  | Mode | Description |
  | ------ | ------------- |
  | **Standard** | Wing analysis → downwash computation → tail flow modification → tail analysis. Complete wing-tail aerodynamic assessment in one run. |
  | **Continuation** | Resume a previous simulation from saved dump files (fort11, fort15, fort21, etc.). Useful for extending converged solutions to nearby conditions. |
  | **AutoRunner** | Automated sweep through a range of angles of attack or Mach numbers. Each step is a continuation from the previous converged solution. Results are exported to a formatted Excel spreadsheet with wing, tail, and total force/moment tables. |

- **Continuation run sources** — Dump data for continuation runs can come from three sources:
  1. Previously saved `.vfp` result files (embedded dump data)
  2. Split JSON archives stored on the server
  3. Browser-side IndexedDB storage (no server upload required — privacy-preserving)

- **Result collection** — Upon completion, the solver output files (forces, Cp distributions, boundary-layer data, wave drag, convergence summaries) are collected and packaged into a single `.vfp` JSON archive for download and post-processing.

---

### 3. VFP-Post Module

The VFP-Post module provides comprehensive post-processing tools for analysing simulation results.

**Key capabilities:**

- **Upload .vfp result files** — Large result archives (100 MB+) are handled via a streaming parser that processes the file progressively without running out of memory. Result data is stored locally in the browser's IndexedDB for instant access.

- **Pressure coefficient (Cp) plots** — View chordwise Cp distributions for each wing section at each analysis level, with separate upper/lower surface curves. Compare results across flow conditions.

- **Force and moment analysis** — Display spanwise distributions of CL, CD, CM, circulation (Gamma), and local twist. View integrated force coefficients:
  - CL (lift coefficient)
  - CD (total drag coefficient)
  - CDi (induced drag)
  - CDv (viscous drag)
  - CDw (wave drag)
  - CM (pitching moment)

- **Boundary-layer data** — Visualise boundary-layer properties along each section: displacement thickness, momentum thickness, shape factor (H), skin friction coefficient (Cf), edge velocity ratios, and transition location.

- **2D contour plots** — Generate colour-filled contour maps of Cp, Mach number, or other flow variables across the wing planform using scipy griddata interpolation.

- **Wave drag analysis** — Examine upper and lower surface wave drag contributions at transonic conditions.

- **Tail downwash computation** — Calculate the downwash angle (epsilon) at the tail location using Lifting Line Theory (LLT) with a horseshoe vortex model. Based on wing circulation distribution and tail geometry from a `.tail` specification file.

---

### 4. ProWiM Module

The ProWiM (Propeller-Wing Interaction Model) module computes the aerodynamic interference effects between propeller slipstreams and the wing.

**Key capabilities:**

- **Slipstream parameters** — Compute KS0D (slipstream viscous loss factor) and TS0D (slipstream temperature ratio) based on propeller thrust coefficient and slipstream geometry.

- **Interference forces** — Calculate the additional lift and drag contributions caused by propeller slipstream interaction:
  - CZ, CX — Total force coefficients with slipstream
  - CZwf, CXwf — Wing-fuselage contributions
  - CZDwf, CXDwf — Incremental contributions due to slipstream

- **Input parameters** — Wing aspect ratio, span-to-diameter ratio (b/D), chord-to-diameter ratio (c/D), zero-lift angle, propeller count, slipstream angle, flap configuration, and thrust coefficients.

---

## Workflow — From Geometry to Results

The following diagram illustrates the complete aerodynamic analysis workflow through FlowVFP:

```text
  ┌──────────────────────────┐
  │    1. GEOMETRY MODULE    │
  │                          │
  │  Import / Create .GEO    │
  │  Edit sections & planform│
  │  Generate input files    │
  │  (GEO + MAP + DAT)       │
  └────────────┬─────────────┘
               │
               ▼
  ┌──────────────────────────┐
  │     2. SOLVER MODULE     │
  │                          │
  │  Upload input files      │
  │  Configure AoA / Mach    │
  │  Run VFP solver          │
  │  (live terminal output)  │
  │  Download .vfp results   │
  └────────────┬─────────────┘
               │
               ▼
  ┌──────────────────────────┐
  │    3. VFP-POST MODULE    │
  │                          │
  │  Upload .vfp file        │
  │  Cp plots per section    │
  │  Force & moment analysis │
  │  Boundary-layer data     │
  │  Contour plots           │
  │  Wave drag analysis      │
  │  Tail downwash (LLT)     │
  └──────────────────────────┘

  ┌──────────────────────────┐
  │    4. ProWiM MODULE      │  (standalone — can be used at any stage)
  │                          │
  │  Propeller-wing          │
  │  interference analysis   │
  └──────────────────────────┘
```

---

## Getting Started

### For End Users (No Installation Required)

Navigate to: **[https://ramtarun02.github.io/VFP-2025](https://ramtarun02.github.io/VFP-2025)**

The application runs entirely in the browser. You need a modern web browser (Chrome, Firefox, Safari, or Edge) and an internet connection.

### For Local Development

Follow these instructions to set up and run FlowVFP on your local machine for development or testing purposes.

#### Prerequisites

Ensure you have the following installed on your system:

| Prerequisite | Version | Download Link |
| --- | --- | --- |
| **Node.js** | ≥ 20 LTS | [https://nodejs.org/](https://nodejs.org/) |
| **Python** | ≥ 3.11 | [https://www.python.org/downloads/](https://www.python.org/downloads/) |
| **pip** | ≥ 23 | Included with Python 3.11+ |
| **Git** | Latest | [https://git-scm.com/downloads](https://git-scm.com/downloads) |

**Optional but recommended:**

- **Visual Studio Code** — with Python and ESLint extensions
- **Windows**: Visual Studio Build Tools (for some Python packages)
- **macOS/Linux**: GCC or Clang (for some Python packages)

#### Step 1: Clone the Repository

```bash
git clone https://github.com/yourusername/FlowVFP.git
cd FlowVFP
```

#### Step 2: Backend Setup (VFP-Python)

The backend is a Python Flask application that provides REST APIs and WebSocket support for the VFP solver.

1. **Navigate to the backend directory:**

   ```bash
   cd VFP-Python
   ```

2. **Create and activate a virtual environment:**

   **Windows:**

   ```bash
   python -m venv .venv
   .venv\Scripts\activate
   ```

   **macOS/Linux:**

   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```

3. **Install dependencies:**

   ```bash
   pip install --upgrade pip
   pip install -r requirements.txt
   ```

   This installs Flask, Flask-SocketIO, NumPy, SciPy, Pandas, and other required packages.

4. **Configure environment variables (optional):**

   Create a `.env` file in the `VFP-Python/` directory to customize settings:

   ```env
   FLASK_ENV=development
   FLASK_DEBUG=1
   SECRET_KEY=your-secret-key-here
   CORS_ORIGINS=http://localhost:5173,http://localhost:3000
   MAX_UPLOAD_SIZE=104857600  # 100 MB
   ```

5. **Start the backend server:**

   ```bash
   python wsgi.py
   ```

   The server will start at <http://127.0.0.1:5000>

   You should see output similar to:

   ```text
    * Running on http://127.0.0.1:5000
    * Restarting with stat
   ```

6. **Verify the backend is running:**

   Open a browser and navigate to <http://127.0.0.1:5000/health>

   You should see: `{"status": "healthy"}`

#### Step 3: Frontend Setup (VFP-2025)

The frontend is a React TypeScript application built with Vite.

1. **Open a new terminal** and navigate to the frontend directory:

   ```bash
   cd VFP-2025
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

   This installs React, TypeScript, Vite, Tailwind CSS, Plotly, Three.js, Socket.IO client, and other dependencies.

3. **Configure API endpoint (if needed):**

   The frontend is configured to connect to the backend at `http://127.0.0.1:5000` by default. If you changed the backend port, update the API configuration in:

   - [src/api/client.ts](VFP-2025/src/api/client.ts)
   - [src/api/socket.ts](VFP-2025/src/api/socket.ts)

4. **Start the development server:**

   ```bash
   npm run dev
   ```

   The application will start at <http://localhost:5173> (default Vite port)

   You should see output similar to:

   ```text
   VITE v5.x.x  ready in xxx ms

   ➜  Local:   http://localhost:5173/
   ➜  Network: use --host to expose
   ```

5. **Open the application:**

   Navigate to <http://localhost:5173> in your browser.

   You should see the FlowVFP landing page.

#### Step 4: Verify the Setup

1. **Test Geometry Module:**
   - Click on "Geometry Module" in the navigation
   - Try importing a sample `.GEO` file from `examples/Wing1/DC304_v2p9_twist_BSL.GEO`
   - Verify that 2D and 3D plots render correctly

2. **Test Solver Module:**
   - Navigate to "Solver Module"
   - Upload the example files (GEO, MAP, DAT) from `examples/Wing1/`
   - Click "Run Simulation" and verify live terminal output appears via WebSocket
   - **Note:** The simulation will only run if VFP solver executables are properly installed

3. **Test Post-Processing Module:**
   - Navigate to "VFP-Post"
   - Upload a `.vfp` result file (run a simulation first or use a sample file)
   - Verify Cp plots, force distributions, and boundary-layer data display correctly

#### Common Issues and Troubleshooting

| Issue | Solution |
| --- | --- |
| **Backend won't start** — "Address already in use" | Another process is using port 5000. Kill it: `netstat -ano \| findstr :5000` then `taskkill /PID <PID> /F` (Windows) or `lsof -ti:5000 \| xargs kill` (macOS/Linux) |
| **Python packages fail to install** | Install Visual Studio Build Tools (Windows) or run `sudo apt install python3-dev` (Linux) |
| **Frontend can't connect to backend** | Check CORS settings in `VFP-Python/src/config.py` — add `http://localhost:5173` to allowed origins |
| **VFP solver not found** | Ensure executables are in `VFP-Python/tools/vfp/` and have execute permissions (`chmod +x` on Unix) |
| **WebSocket connection fails** | Check firewall settings; ensure port 5000 is not blocked |
| **3D plots not rendering** | Enable WebGL in browser settings; update graphics drivers |
| **Large files fail to upload** | Increase `MAX_UPLOAD_SIZE` in backend config; check browser memory |

#### Development Workflow

**Running tests:**

```bash
# Backend tests
cd VFP-Python
pytest tests/

# Frontend tests
cd VFP-2025
npm test
```

**Code formatting and linting:**

```bash
# Backend
cd VFP-Python
black src/ tests/        # Format Python code
flake8 src/ tests/       # Lint Python code

# Frontend
cd VFP-2025
npm run lint             # ESLint
npm run format           # Prettier
```

**Building for production:**

```bash
# Backend (no build needed — Python)
# Just ensure all dependencies are in requirements.txt

# Frontend
cd VFP-2025
npm run build            # Creates optimized build in dist/
npm run preview          # Preview production build
```

#### Additional Resources

For detailed architecture, API documentation, and advanced configuration:

- [VFP-2025/README.md](VFP-2025/README.md) — Frontend architecture, component guide, and development practices
- [VFP-Python/README.md](VFP-Python/README.md) — Backend architecture, API reference, and deployment guide
- [VFP-Python/docs/API.md](VFP-Python/docs/API.md) — Complete REST API and WebSocket protocol documentation

---

## Wing Geometry File Format

The `.GEO` file is the primary input format for defining wing geometry. It follows the ESDU 02014 standard and specifies:

- **Header**: Number of spanwise sections (NSECT), interpolation parameters
- **Sections** (in order of increasing spanwise coordinate, starting at y = 0):
  - Spanwise position (YSECT)
  - Leading-edge coordinate (G1SECT) and trailing-edge coordinate (G2SECT)
  - Vertical displacement / dihedral (HSECT)
  - Twist angle (TWSIN) about twist axis position (XTWSEC)
  - Upper surface coordinates (MU points) and lower surface coordinates (ML points)
  - Section marker (IMARK) indicating whether coordinates differ from the inboard section
- **Body definition** (optional): Streamwise stations with radius values (XRAD, RAD) for axisymmetric fuselage; set NRAD = 0 for wing-alone cases.

**Constraints:**

- 2 ≤ NSECT ≤ 38
- First section must be at y = 0 (symmetry plane)
- Last section must be at the wing tip
- Maximum 125 coordinate pairs per surface (upper/lower)
- File extension is case-sensitive: `.GEO` (uppercase)

For complete format specification, refer to **Section 4.1** of ESDU 02014.

---

## Supported File Types

| Extension | Description | Used by |
| --- | --- | --- |
| `.GEO` | Wing geometry definition (sections, coordinates, body) | Geometry Module, Solver |
| `.MAP` | Computational grid mapping parameters | Solver |
| `.DAT` | Flow conditions (Mach, AoA, Reynolds number, grid levels) | Solver |
| `.vfp` | FlowVFP result archive (JSON containing all input + output data) | VFP-Post |
| `.forces` | Spanwise force/moment distributions (solver output) | VFP-Post |
| `.cp` | Chordwise pressure coefficient distributions (solver output) | VFP-Post |
| `.vis` | Boundary-layer data (solver output) | VFP-Post |
| `.conv` | Convergence history (solver output) | Solver terminal |
| `.sum` | Solution summary (solver output) | VFP-Post |
| `wavedrg73*.dat` | Wave drag breakdown — upper/lower surface (solver output) | VFP-Post |
| `fort*` | Fortran dump files for continuation runs (fort11, fort15, fort21, fort50, fort51, fort52, fort55) | Solver (continuation) |
| `.tail` | Tail geometry specification for downwash calculation | VFP-Post |
| `.xlsx` | AutoRunner Excel export with formatted polar tables | AutoRunner output |

---

## Example Case

The `examples/Wing1/` directory contains a sample wing case to get started:

| File | Description |
| --- | --- |
| `DC304_v2p9_twist_BSL.GEO` | Wing geometry for a transonic transport wing configuration |
| `DC304_v2p9.map` | Grid mapping file for the DC304 geometry |
| `M070Re0p00ma+00p00.DAT` | Flow conditions: Mach 0.70, AoA 0.00° |

**To run this example:**

1. Open the Geometry Module and import `DC304_v2p9_twist_BSL.GEO`
2. Inspect the wing planform and sections in the 2D/3D views
3. Navigate to the Solver Module
4. Upload the three input files (GEO, MAP, DAT)
5. Set a simulation name and click Run
6. Monitor solver output in the live terminal
7. Download the `.vfp` result file
8. Open VFP-Post and upload the `.vfp` file to analyse Cp, forces, and boundary-layer data

---

## Repository Structure

```text
FlowVFP/
├── VFP-2025/                    React / TypeScript frontend client
├── VFP-Python/                  Python / Flask backend server
├── examples/                    Sample wing geometry cases
│   └── Wing1/                   DC304 transonic wing example
├── json-analyzer-with-data/     Standalone JSON analysis tool for large VFP files
├── README.md                    This file
└── SECURITY_AUDIT.md            Security vulnerability audit and remediation report
```

| Component | Technology | Description |
| --- | --- | --- |
| **VFP-2025** | React 19, TypeScript, Vite, Tailwind CSS, Plotly, Three.js, D3, Socket.IO | Browser-based UI for geometry editing, simulation control, and post-processing |
| **VFP-Python** | Python 3.11+, Flask, Flask-SocketIO, NumPy, SciPy, Pandas | REST API server, WebSocket simulation handler, VFP solver orchestration |
| **VFP Solver** | Fortran (compiled executables) | `vfphe.exe` (inviscid solver), `visflow.exe` (viscous coupling), `f137b1.exe` (wave drag) |

---

## Deployment

| Component | Platform | Details |
| --- | --- | --- |
| **Frontend** | GitHub Pages | Static build served from `gh-pages` branch at `/VFP-2025` sub-path |
| **Backend** | Azure App Service | Python web app with WebSocket support; configured via `web.config` and `startup.py` |
| **Backend (alt)** | Render.com | Docker-based deployment with persistent disk; configured via `render.yaml` |

---

## Security

FlowVFP has undergone a comprehensive security audit with **18 findings** (3 Critical, 5 High, 6 Medium, 4 Low) — all fully remediated. Key protections include:

- Path traversal prevention on all file operations
- Shell injection prevention (no `shell=True` subprocess calls)
- JSON Schema validation on all API inputs
- Rate limiting on all endpoints
- CORS restricted to allowed origins
- Upload size cap (100 MB)
- Filename sanitisation
- No stack traces in production responses

For full details, see [SECURITY_AUDIT.md](SECURITY_AUDIT.md).

---

## References

1. **ESDU 02014** — *Full-potential (FP) method for three-dimensional wings and wing-body combinations — inviscid flow. Part 2: Use of FP and related programs.* Engineering Sciences Data Unit, 2002.

---

## Licence

This software is released under a **Cranfield University Academic License**. It may be used freely by Cranfield University students, staff, and researchers for academic and educational purposes. Use by anyone outside Cranfield University requires prior written consent from the copyright holder.

See [LICENSE](LICENSE) for full terms.

# VFP-Python — Backend Developer Guide

> Python / Flask backend for the FlowVFP aerodynamic analysis application. Provides REST APIs, WebSocket simulation control, and VFP solver orchestration.

---

## Table of Contents

- [VFP-Python — Backend Developer Guide](#vfp-python--backend-developer-guide)
  - [Table of Contents](#table-of-contents)
  - [Quick Start](#quick-start)
  - [Technology Stack](#technology-stack)
  - [Project Structure](#project-structure)
  - [Architecture Overview](#architecture-overview)
    - [Application Factory](#application-factory)
    - [Configuration System](#configuration-system)
    - [Flask Extensions](#flask-extensions)
    - [Blueprint Layout (REST API)](#blueprint-layout-rest-api)
      - [Health Blueprint](#health-blueprint)
      - [Geometry Blueprint (`/api/geometry`)](#geometry-blueprint-apigeometry)
      - [Simulation Blueprint (`/api/simulation`)](#simulation-blueprint-apisimulation)
      - [Files Blueprint (`/api/files`)](#files-blueprint-apifiles)
      - [Post-processing Blueprint (`/api/post`)](#post-processing-blueprint-apipost)
      - [ProWiM Blueprint (`/api/prowim`)](#prowim-blueprint-apiprowim)
    - [Socket.IO Handlers (WebSocket)](#socketio-handlers-websocket)
    - [Security Layer](#security-layer)
    - [Validation Layer](#validation-layer)
  - [API Reference](#api-reference)
  - [Simulation Engine — Deep Dive](#simulation-engine--deep-dive)
    - [Entry Point](#entry-point)
    - [Three Execution Modes](#three-execution-modes)
      - [1. Standard Mode](#1-standard-mode)
      - [2. Continuation Mode](#2-continuation-mode)
      - [3. AutoRunner Mode](#3-autorunner-mode)
    - [Key Engine Functions](#key-engine-functions)
  - [Cross-Platform Execution (Wine)](#cross-platform-execution-wine)
  - [Processing Modules](#processing-modules)
    - [readGEO.py — Geometry Parser \& Writer](#readgeopy--geometry-parser--writer)
    - [readVFP.py — Multi-Format Parser (1,100+ lines)](#readvfppy--multi-format-parser-1100-lines)
    - [downwashLLT.py — Lifting Line Theory Downwash](#downwashlltpy--lifting-line-theory-downwash)
    - [ProWim.py — Propeller-Wing Interaction](#prowimpy--propeller-wing-interaction)
    - [json-splitter.py — Large File Splitter](#json-splitterpy--large-file-splitter)
  - [Data Flow \& File I/O](#data-flow--file-io)
    - [Directory Structure (Runtime)](#directory-structure-runtime)
    - [Result File Pipeline](#result-file-pipeline)
  - [Testing](#testing)
    - [Test Fixtures (`conftest.py`)](#test-fixtures-conftestpy)
    - [Test Coverage](#test-coverage)
  - [Deployment](#deployment)
    - [Azure App Service](#azure-app-service)
    - [Render.com](#rendercom)
    - [Local Development](#local-development)
  - [Environment Variables](#environment-variables)
  - [Development Workflow](#development-workflow)
    - [Adding a new API endpoint](#adding-a-new-api-endpoint)
    - [Adding a new processing module](#adding-a-new-processing-module)
  - [Key Design Decisions](#key-design-decisions)

---

## Quick Start

```bash
# Prerequisites: Python ≥ 3.11, pip ≥ 23

# Create & activate virtual environment
python -m venv .venv
.venv\Scripts\activate              # Windows
# source .venv/bin/activate         # macOS / Linux

# Install dependencies
pip install -r requirements.txt

# Copy environment template
copy .env.example .env              # Windows
# cp .env.example .env              # macOS / Linux

# Generate a secret key
python -c "import secrets; print(secrets.token_hex(32))"
# Paste the output into .env as SECRET_KEY=<value>

# Run development server
python wsgi.py
```

The API is now available at `http://127.0.0.1:5000`. Health check: `GET /health`.

---

## Technology Stack

| Category | Library | Version | Purpose |
| --- | --- | --- | --- |
| **Web Framework** | Flask | 3.1 | HTTP request handling, routing, blueprints |
| **WebSocket** | Flask-SocketIO | 5.5 | Real-time simulation output streaming |
| **Async Engine** | eventlet (Linux) / threading (Windows) | 0.39 | Socket.IO async mode |
| **WSGI Server** | Gunicorn | 23.0 | Production HTTP server (Linux) |
| **CORS** | Flask-Cors | 5.0 | Cross-origin request handling |
| **Rate Limiting** | Flask-Limiter | 3.9 | API abuse prevention |
| **Validation** | jsonschema | 4.23 | JSON Schema request validation |
| **Numerics** | NumPy, SciPy, Pandas | — | Interpolation, grid generation, data processing |
| **Plotting** | Matplotlib | — | Server-side plot generation (downwash) |
| **Process Mgmt** | psutil | — | Solver process tree management |
| **Excel Export** | openpyxl | — | AutoRunner polar table export |
| **Environment** | python-dotenv | — | `.env` file loading |

---

## Project Structure

```text
VFP-Python/
├── wsgi.py                      WSGI entry point (dev: socketio.run, prod: gunicorn)
├── startup.py                   Azure App Service startup script
├── requirements.txt             Python dependencies
├── render.yaml                  Render.com deployment config
├── web.config                   Azure App Service (IIS) config
├── .env.example                 Environment variable template
│
├── src/                         ──── Application source ────
│   ├── __init__.py
│   ├── factory.py               Application factory (create_app)
│   ├── config.py                Environment-driven config classes
│   ├── extensions.py            Flask extension singletons
│   │
│   ├── api/                     REST API blueprints
│   │   ├── __init__.py
│   │   ├── health.py            GET /health, GET /ping
│   │   ├── geometry.py          POST /api/geometry/* (import, export, fpcon, interpolate)
│   │   ├── simulation.py        POST/GET /api/simulation/* (start, upload, files)
│   │   ├── files.py             POST /api/files/* (VFP upload, result listing)
│   │   ├── postprocessing.py    POST /api/post/* (Cp, forces, vis, contour, downwash)
│   │   └── prowim.py            POST /api/prowim/compute
│   │
│   ├── sockets/                 Socket.IO event handlers
│   │   ├── __init__.py
│   │   └── simulation.py        connect, disconnect, start/stop_simulation, download
│   │
│   └── utils/                   Shared utilities
│       ├── __init__.py          Re-exports: allowed_file, safe_filename, safe_join, ...
│       ├── security.py          Path traversal guards, filename sanitisation
│       └── validators.py        JSON Schema definitions + validate_json decorator
│
├── modules/                     ──── VFP Solver Orchestration ────
│   ├── vfp-engine.py            Core simulation engine (1400+ lines)
│   ├── airVFP.py                Alternative simulation runner
│   ├── json-splitter.py         Large VFP JSON file splitter
│   ├── wine_utils.py            Cross-platform .exe/.bat runner (Wine on Linux)
│   ├── post_export_excel.py     Post-hoc AutoRunner Excel export
│   ├── VFP-Simulation-Algorithm.md  Engine implementation reference
│   │
│   ├── vfp_processing/          Domain-specific file parsers
│   │   ├── readGEO.py           .GEO parser + writer + airfoil processor
│   │   ├── readVFP.py           Multi-format parser (GEO, FLOW, FORCE, CP, VIS, MAP, WAVEDRAG)
│   │   ├── downwashLLT.py       Lifting Line Theory downwash computation
│   │   ├── ProWim.py            Propeller-wing interaction model
│   │   ├── runVFP.py            Batch file generator + file copy helper
│   │   └── readdat.py           Flow config parser (WIP)
│   │
│   └── utils/                   Solver binaries and automation scripts
│       ├── vfphe.exe            Main VFP solver (Fortran)
│       ├── visflow.exe          Viscous flow solver
│       ├── f137b1.exe           Wave drag calculator
│       ├── vfpextractdata.exe   Data extraction tool
│       ├── vfpfusegenv2.exe     Fuselage geometry generator
│       ├── vfptvkbodyv8.exe     TVK body tool
│       ├── cmdvfp.bat           Main simulation batch script
│       ├── runvfphe.bat         VFP solver runner
│       ├── runvfphe_v4.bat      VFP solver runner (v4)
│       ├── VFP_*.py             Python automation scripts
│       └── Flow_Conditions/     Flow condition templates
│
├── data/                        ──── Runtime data (gitignored) ────
│   ├── Simulations/             Simulation output directories
│   ├── uploads/                 Uploaded files (temporary)
│   └── temp/                    Temporary processing files
│
├── logs/                        Application logs
│
├── tests/                       ──── Test suite ────
│   ├── conftest.py              pytest fixtures (app, client)
│   ├── test_health.py           Health endpoint tests
│   ├── test_security.py         Security middleware tests
│   ├── test_simulation.py       Simulation endpoint tests
│   └── test_utils_security.py   Security utility unit tests
│
├── docs/
│   └── API.md                   Complete API reference (509 lines)
│
└── tools/                       ──── Solver binaries (deployment) ────
    ├── fpcon/                   FPCON executable and support files
    └── vfp/                     VFP solver executables (production copy)
```

---

## Architecture Overview

### Application Factory

The application uses Flask's **factory pattern** in `src/factory.py`. The `create_app(config_name=None)` function:

1. Creates a Flask instance
2. Loads the appropriate config class (`DevelopmentConfig`, `ProductionConfig`, or `TestingConfig`)
3. Configures logging and creates required directories (`data/`, `logs/`, `temp/`)
4. Patches `sys.path` to include the `modules/` directory
5. Initialises extensions (SocketIO, Limiter, CORS)
6. Registers 6 API blueprints + socket handlers
7. Registers global error handlers (400, 403, 404, 413, 429, 500)

```python
# wsgi.py
from src.factory import create_app
from src.extensions import socketio

application = create_app()

if __name__ == '__main__':
    socketio.run(application, host='0.0.0.0', port=5000)
```

### Configuration System

`src/config.py` provides a hierarchy of config classes:

```text
BaseConfig                    # Shared defaults
├── DevelopmentConfig         # DEBUG=True, relaxed CORS
├── ProductionConfig          # DEBUG=False, validates SECRET_KEY
└── TestingConfig             # TESTING=True, in-memory data
```

**Key configuration values:**

| Setting | Value | Description |
| --- | --- | --- |
| `MAX_CONTENT_LENGTH` | 100 MB | Maximum upload size |
| `SOCKETIO_ASYNC_MODE` | `threading` (Win) / `eventlet` (Linux) | Socket.IO async backend |
| `SOCKETIO_PING_TIMEOUT` | 300s | Socket.IO ping timeout for long simulations |
| `SOCKETIO_MAX_HTTP_BUFFER_SIZE` | 100 MB | Maximum WebSocket message size |
| `RATE_LIMIT_DEFAULT` | 200/hour | Flask-Limiter default rate |
| `CORS_ORIGINS` | GitHub Pages + localhost ports | Allowed CORS origins |

**Path resolution** (`_resolve_paths()`):
Automatically detects the deployment environment (Azure App Service, Render.com, Docker, Windows IIS, local) and resolves `PROJECT_ROOT`, `DATA_ROOT`, `UPLOAD_FOLDER`, `SIMULATIONS_FOLDER`, `TOOLS_FOLDER`, `LOGS_FOLDER`, and `TEMP_FOLDER` accordingly.

### Flask Extensions

`src/extensions.py` creates singleton instances that are bound to the app during factory setup:

| Extension | Instance | Purpose |
| --- | --- | --- |
| `Flask-SocketIO` | `socketio` | WebSocket event handling, background tasks |
| `Flask-Limiter` | `limiter` | Rate limiting (memory storage, fixed-window) |
| `Flask-Cors` | `cors` | Per-resource CORS configuration |

`init_extensions(app)` binds all extensions to the Flask app. In debug mode, Socket.IO allows all origins (`"*"`); in production, it restricts to configured origins.

### Blueprint Layout (REST API)

Six blueprints are registered with the application:

| Blueprint | URL Prefix | Module | Description |
| --- | --- | --- | --- |
| `health_bp` | `/` | `src/api/health.py` | Liveness probes |
| `geometry_bp` | `/api/geometry` | `src/api/geometry.py` | Wing geometry operations |
| `simulation_bp` | `/api/simulation` | `src/api/simulation.py` | Simulation setup and management |
| `files_bp` | `/api/files` | `src/api/files.py` | VFP file upload and result listing |
| `postprocessing_bp` | `/api/post` | `src/api/postprocessing.py` | Result file parsing and analysis |
| `prowim_bp` | `/api/prowim` | `src/api/prowim.py` | Propeller-wing interaction model |

#### Health Blueprint

```text
GET  /health    → { status, directories: { simulations, uploads, temp } }
GET  /ping      → { message: "pong" }
```

#### Geometry Blueprint (`/api/geometry`)

```text
POST /import              Upload .GEO file(s) → parsed geoData + plotData (airfoil curves)
POST /export              Serialize section data → download .GEO file
POST /compute-desired     Modify a single section (twist rotation, dihedral shift)
POST /interpolate-parameter  Apply interpolation across sections (8 methods)
```

**Interpolation methods** supported: `linear`, `quadratic`, `elliptical`, `cosine`, `power`, `schuemann`, `hermite`, `exponential`.

The geometry import flow:

1. Frontend uploads `.GEO` file via `multipart/form-data`
2. `readGEO()` parses sections (YSECT, G1SECT, HSECT, TWIST, upper/lower coordinates)
3. `airfoils()` processes sections: interpolates coordinates to 10,000 points, computes camber line, thickness-to-chord ratio
4. Returns `geoData` (raw parameters) + `plotData` (visualisation-ready data)

#### Simulation Blueprint (`/api/simulation`)

```text
POST /start           Validate + persist input files to disk (wing/tail/body)
GET  /folder/<name>   List files in a simulation directory
POST /file-content    Read a specific file from simulation directory
POST /upload-data     Store vfpData JSON, return uploadId
```

#### Files Blueprint (`/api/files`)

```text
POST /upload-vfp         Upload .vfp archive → split via json-splitter.py → return main + manifest
POST /vfp-result-files   List grouped result files from split archive
```

#### Post-processing Blueprint (`/api/post`)

```text
POST /parse-cp           Parse .cp file → chordwise Cp per section
POST /parse-forces       Parse .forces file → spanwise force distributions
POST /parse-dat          Parse .dat flow file → flight conditions
POST /parse-vis          Parse .vis file → boundary-layer data per section
POST /parse-vfp-file     Parse a file from uploaded VFP archive
POST /contour-grid       Generate 2D meshgrid from scattered data (scipy griddata)
POST /tail-downwash      Compute downwash via Lifting Line Theory
```

#### ProWiM Blueprint (`/api/prowim`)

```text
POST /compute     Compute propeller-wing interaction forces (KS0D, TS0D, CZ, CX variants)
```

### Socket.IO Handlers (WebSocket)

Socket event handlers are registered in `src/sockets/simulation.py`:

| Event | Direction | Description |
| --- | --- | --- |
| `connect` | Client → Server | Register client connection |
| `disconnect` | Client → Server | Terminate running simulation process |
| `ping` | Client → Server | Heartbeat → responds with `pong` |
| `start_simulation` | Client → Server | Launch VFP solver as background task |
| `stop_simulation` | Client → Server | Kill solver process tree (via psutil) |
| `download` | Client → Server | Send `.vfp` result file bytes to client |
| `get_simulation_folder` | Client → Server | Return file listing |
| `message` | Server → Client | Solver stdout line (real-time) |
| `simulation_finished` | Server → Client | Solver completed (exit code + message) |
| `simulation_error` | Server → Client | Solver error (error string) |

**Simulation execution flow:**

```text
Client emits 'start_simulation' with vfpData payload
  │
  ├── Server writes vfpData JSON to temp file (UUID-named)
  │
  ├── Server launches background task (socketio.start_background_task):
  │     │
  │     ├── Spawns subprocess: python vfp-engine.py <temp_file_path>
  │     │
  │     ├── Streams stdout line-by-line:
  │     │     └── Each line → emit('message', line) to client
  │     │
  │     ├── Waits for process completion
  │     │
  │     └── On exit:
  │           ├── Success → emit('simulation_finished', { exit_code, message })
  │           └── Error   → emit('simulation_error', { error })
  │
  └── _current_process stores the subprocess reference
      (used by stop_simulation to kill the process tree)
```

> **Note:** `_current_process` is a module-level variable — not per-user. This is documented as a known limitation; a per-session process map is needed for concurrent multi-user support.

### Security Layer

`src/utils/security.py` provides four security primitives used across all blueprints:

| Function | Purpose |
| --- | --- |
| `allowed_file(filename)` | Check file extension against whitelist |
| `safe_filename(filename)` | Sanitise filename (max 128 chars, strip dangerous characters) |
| `safe_join(base, *paths)` | Join paths and verify the result is under `base` (prevents path traversal via `resolve()`) |
| `validate_sim_name(name)` | Validate simulation names (alphanumeric + dash/underscore/dot, max 128 chars) |

All file operations in blueprints use `safe_join()` to prevent directory traversal attacks. Filenames are sanitised before disk writes. Simulation names are validated before being used in directory paths.

### Validation Layer

`src/utils/validators.py` defines JSON Schema specifications and a `validate_json(schema)` decorator:

```python
@validate_json(VFP_DATA_SCHEMA)
def start_simulation(payload):
    # payload is already validated and parsed
    ...
```

**Schemas defined:**

| Schema | Used by | Validates |
| --- | --- | --- |
| `VFP_DATA_SCHEMA` | Simulation start | formData structure, file configs |
| `VFP_RESULT_FILES_SCHEMA` | File listing | Upload ID and directory reference |
| `INTERPOLATE_SCHEMA` | Geometry interpolation | Sections, parameter name, method |
| `PROWIM_SCHEMA` | ProWiM computation | Wing AR, b/D, c/D, thrust coefficients |
| `CONTOUR_GRID_SCHEMA` | Contour generation | Scattered data points, grid resolution |

The `validate_json` decorator:

1. Parses request body as JSON (returns 400 on failure)
2. Validates against the specified JSON Schema (returns 422 with validation errors)
3. Injects the parsed payload as the first argument to the route handler

---

## API Reference

For complete request/response examples for every endpoint, see [docs/API.md](docs/API.md).

---

## Simulation Engine — Deep Dive

The core simulation logic lives in `modules/vfp-engine.py` (1,400+ lines). It is the entry point executed as a subprocess by the Socket.IO handler.

### Entry Point

```bash
python vfp-engine.py <vfpFilePath>
```

The engine reads the vfpData JSON from `<vfpFilePath>`, then determines the execution mode based on `formData` flags.

### Three Execution Modes

#### 1. Standard Mode

The default mode for a fresh simulation:

```text
1. Read vfpData JSON
2. Create simulation directory: data/Simulations/<simName>/
3. Create wing/ and tail/ subdirectories
4. Copy solver binaries to wing/ and tail/
5. Write input files (GEO, MAP, DAT) to wing/
6. Generate flow file from formData (AoA, Mach)
7. Execute solver in wing/: cmdvfp.bat → vfphe.exe → visflow.exe
8. Parse wing results (forces, Cp)
9. If tail config present:
    a. Compute downwash from wing results
    b. Modify tail flow file (adjust AoA for downwash)
    c. Execute solver in tail/
    d. Parse tail results
10. Collect all results into vfpData
11. Save as <simName>.vfp JSON file
12. Print completion message (picked up by Socket.IO handler)
```

#### 2. Continuation Mode

Resume from a previously converged solution:

```text
1. Read vfpData JSON (includes continuationRun=true flag)
2. Locate dump files (fort11, fort15, fort21, fort50, fort51, fort52, fort55)
   from one of three sources:
   a. Embedded in vfpData JSON (from browser IndexedDB)
   b. Split-JSON files on server (from previous upload)
   c. Inline payload in vfpData
3. Write dump files to simulation directory
4. Modify flow file for new AoA/Mach
5. Execute solver (reads dump files for warm-start)
6. Collect results and save
```

#### 3. AutoRunner Mode

Automated parameter sweep:

```text
1. Read vfpData JSON (autoRunner=true, autoMode='aoa'|'mach')
2. Run first step as standard mode
3. For each subsequent step:
   a. Save current dump files
   b. Increment AoA or Mach by autoStepSize
   c. Write new flow file
   d. Execute continuation run
   e. Extract forces and check convergence
   f. Accumulate results
4. Export formatted Excel spreadsheet:
   - Wing polars table (step, AoA, Mach, CL, CDi, CDv, CDw, CD, CM)
   - Tail polars table (same columns)
   - Totals table (wing + tail combined)
   - Formatted with openpyxl styles (headers, borders, number formats)
5. Save all results
```

### Key Engine Functions

| Function | Description |
| --- | --- |
| `run_vfp()` | Standard mode orchestrator |
| `run_vfp_continuation()` | Continuation mode orchestrator |
| `generate_flow_file()` | Create .DAT file from AoA/Mach parameters |
| `extract_polars()` | Parse force coefficients from solver output |
| `extract_forces_level1()` | Extract level-1 force data from .forces file |
| `extract_wavedrag_cdw()` | Parse wave drag from wavedrg73 files |
| `wing_step_succeeded()` | Verify convergence of a solver step |
| `vfp_dumpfile_write()` | Write fort dump files for continuation |
| `write_dump_files_from_split_json()` | Restore dumps from split-JSON archive |
| `write_dump_files_from_payload()` | Restore dumps from browser IndexedDB payload |
| `add_vfp_results_to_data()` | Merge solver output into vfpData structure |
| `save_vfp_results()` | Serialise final vfpData to .vfp JSON |
| `export_wing_tail_excel()` | Generate formatted AutoRunner polar spreadsheet |

For the complete algorithm reference, see [modules/VFP-Simulation-Algorithm.md](modules/VFP-Simulation-Algorithm.md).

---

## Cross-Platform Execution (Wine)

The VFP solver executables are Windows binaries (`.exe`, `.bat`). On Linux deployments, `modules/wine_utils.py` provides transparent cross-platform execution:

| Function | Description |
| --- | --- |
| `WineUtils.is_linux()` | Detect OS |
| `WineUtils.check_wine_installed()` | Verify Wine availability |
| `WineUtils.initialize_wine_prefix()` | Set up Wine prefix |
| `run_exe_with_wine(exe, args, cwd)` | Run `.exe` natively on Windows, via Wine on Linux |
| `run_bat_with_wine(bat, cwd)` | Run `.bat` natively on Windows, via Wine on Linux |
| `copy_files_to_folder(src, dst)` | Wine-compatible directory copy |

---

## Processing Modules

The `modules/vfp_processing/` directory contains domain-specific file parsers and computational modules:

### readGEO.py — Geometry Parser & Writer

| Function | Description |
| --- | --- |
| `readGEO(filepath)` | Parse .GEO → sections dict (YSECT, G1SECT, HSECT, TWIST, coordinates...) |
| `airfoils(geoData)` | Process sections: interpolate to 10,000 pts, compute camber/thickness |
| `interpolate_airfoil(x, z, n)` | Linear interpolation to n points |
| `writeGEO(sections, filepath)` | Serialise sections back to .GEO format |

### readVFP.py — Multi-Format Parser (1,100+ lines)

| Function | Input Format | Returns |
| --- | --- | --- |
| `readGEO(filepath)` | `.GEO` | `{ fileName, NSECT, sections, NRAD, XRAD, RAD }` |
| `readFLOW(filepath)` | `.dat` | `{ fileName, title, fuse, levels }` |
| `readFORCE(filepath)` | `.forces` | Level data (J, YAVE, TWIST, CHORD, CL, CD, CM, GAM) + coefficients |
| `readCP(filepath)` | `.cp` | Per-section X/C, Z/C, CP, P/H, M, Q + vortex wake + coefficients |
| `readVIS(filepath)` | `.vis` | Per-section boundary-layer data (Cp, Uinv, Uvis, Theta/c, H, Cf) |
| `readMAP(filepath)` | `.map` | Title, parameters |
| `readWAVEDRG(filepath)` | `wavedrg73*.dat` | Upper/lower CDW tables (scaled by 1e-4) |
| `mergeVFPData(objects)` | — | Merge multiple parsed objects into consolidated structure |
| `saveConsolidatedJSON(data, path)` | — | Save consolidated data to file |

### downwashLLT.py — Lifting Line Theory Downwash

Computes the downwash angle (ε) at the tail location using a horseshoe vortex model:

1. Parse wing CP data → extract spanwise CL distribution
2. Parse tail geometry from `.tail` file
3. Compute circulation: Γ = 0.5 × V∞ × c × cl
4. Build horseshoe vortex system (bound vortex + trailing legs)
5. Apply Biot-Savart law at tail control points
6. Return: ε arrays, effective ε, Prandtl ε, local velocity vectors, average local Mach

### ProWim.py — Propeller-Wing Interaction

Computes propeller slipstream effects on wing forces:

- `compute_KS0D()` — slipstream viscous loss parameter
- `compute_TS0D()` — slipstream temperature ratio
- Force increments: CZ, CZwf, CZDwf, CX, CXDwf

### json-splitter.py — Large File Splitter

Splits large VFP result JSON files (100 MB+) for efficient browser loading:

- Extracts `results.wingConfig` children into separate files
- Creates `main.json` (metadata), `manifest.json` (file listing), per-flow-key JSON files
- Two modes: full JSON parse (in-memory) and streaming line-by-line (for extremely large files)

---

## Data Flow & File I/O

### Directory Structure (Runtime)

```text
data/
├── Simulations/
│   └── <simName>/                  One directory per simulation
│       ├── wing/                   Wing solver working directory
│       │   ├── *.GEO, *.map, *.dat Input files
│       │   ├── vfphe.exe, ...      Solver copies
│       │   ├── *.forces            Force output
│       │   ├── *.cp                Pressure coefficients
│       │   ├── *.vis               Boundary-layer data
│       │   ├── *.conv              Convergence history
│       │   ├── *.sum               Solution summary
│       │   ├── wavedrg73*.dat      Wave drag
│       │   └── fort*               Dump files (continuation)
│       │
│       ├── tail/                   Tail solver working directory
│       │   └── (same structure as wing/)
│       │
│       └── <simName>.vfp           Final result archive (JSON)
│
├── uploads/                        Temporary file uploads
│   └── <uuid>/                     Per-upload directory
│       ├── original.vfp            Uploaded VFP file
│       └── split-json/             Split output
│           ├── main.json
│           ├── manifest.json
│           └── wingConfig-*.json   Per-flow-condition files
│
└── temp/                           Temporary processing files
    └── <uuid>.json                 vfpData temp files (cleaned after use)
```

### Result File Pipeline

```text
  Solver execution (vfphe.exe, visflow.exe, f137b1.exe)
      │
      ▼
  Raw output files (.forces, .cp, .vis, .conv, .sum, wavedrg73*.dat, fort*)
      │
      ▼
  vfp-engine.py collects + packages into .vfp JSON archive
      │
      ▼
  Browser downloads .vfp file
      │
      ├── Streaming parser extracts result files → IndexedDB
      │
      └── Post-processing API parses individual result files on demand
```

---

## Testing

```bash
# Run all tests
pytest tests/ -v --tb=short

# Run with coverage
pytest tests/ --cov=src --cov-report=term-missing

# Run specific test file
pytest tests/test_health.py -v
```

### Test Fixtures (`conftest.py`)

| Fixture | Scope | Description |
| --- | --- | --- |
| `app` | session | Flask app with `TestingConfig` |
| `client` | function | Flask test client |

### Test Coverage

| File | Tests | Coverage |
| --- | --- | --- |
| `test_health.py` | Health + ping endpoints | `/health`, `/ping` response codes and content |
| `test_security.py` | Security middleware | Path traversal prevention, CORS, rate limiting, error handlers |
| `test_simulation.py` | Simulation endpoints | File upload validation, simulation name validation, directory listing |
| `test_utils_security.py` | Security utilities | `allowed_file()`, `safe_filename()`, `safe_join()`, `validate_sim_name()` — edge cases |

---

## Deployment

## Self-contained Windows Distribution (Additive Build Lane)

This repository includes an additive packaging process for local-network distribution
without changing existing development and cloud deployment flows.

### Output artifacts

1. Portable runtime folder: VFP-Python/dist/FlowVFP
2. Installer executable: VFP-Python/dist/installer/FlowVFP-Setup-<version>.exe

### Build command from workspace root

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build_flowvfp_dist.ps1
```

### Runtime behavior

1. Frontend, REST API, and Socket.IO are served behind one LAN URL.
2. First-run config is generated at %PROGRAMDATA%\FlowVFP\runtime-config.json.
3. Host and port are configurable in that runtime config.
4. Python runtime is bundled in the distribution; no host Python is required.

### Azure App Service

Primary production deployment target. Configured via:

- **`web.config`** — IIS httpPlatformHandler configuration:
  - Routes to `startup.py`
  - Enables WebSockets
  - Sets security headers (X-Content-Type-Options, X-Frame-Options, HSTS)
  - 100 MB upload limit
  - MIME types for VFP file formats (.geo, .map, .dat, .vfp, .forces, .cp, .vis)
  - URL rewrite rules

- **`startup.py`** — Azure startup script:
  - Detects Azure environment (`HTTP_PLATFORM_PORT`, `WEBSITE_SITE_NAME`)
  - Configures PYTHONPATH for app + modules
  - Validates Flask importability
  - Starts `socketio.run()` on the Azure-assigned port

**Required Azure App Settings:**

```text
FLASK_ENV=production
SECRET_KEY=<random 32-byte hex>
CORS_ORIGINS=https://ramtarun02.github.io
```

### Render.com

Alternative deployment via Docker. Configured in `render.yaml`:

- Docker-based web service
- Persistent disk mount for `data/`
- Environment variables: FLASK_ENV, PYTHONPATH, WINEPREFIX, SECRET_KEY (auto-generated)

### Local Development

```bash
python wsgi.py
# Runs Flask dev server with SocketIO on http://127.0.0.1:5000
# SOCKETIO_ASYNC_MODE=threading on Windows (eventlet on Linux)
# use_reloader=False (conflicts with SocketIO background tasks)
```

---

## Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `FLASK_ENV` | `development` | `development` or `production` |
| `SECRET_KEY` | *(required in production)* | Flask secret key for session signing |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:3000` | Comma-separated allowed CORS origins |
| `MAX_UPLOAD_MB` | `100` | Maximum upload file size in MB |
| `RATE_LIMIT_DEFAULT` | `120/minute` | Flask-Limiter default rate limit |
| `LOG_LEVEL` | `INFO` | Python logging level |
| `VFP_SOLVER_PATH` | `tools/vfp` | Path to VFP solver binaries |
| `FPCON_PATH` | `tools/fpcon` | Path to FPCON binaries |
| `DATA_DIR` | `data` | Root directory for simulation data |

---

## Development Workflow

| Task | Command |
| --- | --- |
| Start dev server | `python wsgi.py` |
| Run tests | `pytest tests/ -v` |
| Run with coverage | `pytest tests/ --cov=src` |
| Lint (if configured) | `flake8 src/` |
| Type check (if configured) | `mypy src/` |

### Adding a new API endpoint

1. **Define the endpoint** in the appropriate blueprint file under `src/api/`
2. **Add JSON Schema** in `src/utils/validators.py` if the endpoint accepts JSON input
3. **Apply decorators**: `@validate_json(SCHEMA)` for validation, `@limiter.limit()` for rate limiting
4. **Use security utils**: `safe_join()` for any file paths, `safe_filename()` for any filenames, `validate_sim_name()` for simulation directories
5. **Add tests** in `tests/`
6. **Document** in `docs/API.md`

### Adding a new processing module

1. Create the module in `modules/vfp_processing/`
2. It will be automatically importable because `factory.py` adds `modules/` to `sys.path`
3. Import and use in the relevant blueprint

---

## Key Design Decisions

| Decision | Rationale |
| --- | --- |
| **Application factory pattern** | Enables testing with different configs; clean extension initialisation; avoids circular imports |
| **Blueprints per domain** | Separation of concerns; each endpoint group is independently testable and maintainable |
| **Subprocess for solver** | VFP executables are Fortran binaries that must run as separate OS processes; subprocess with stdout streaming enables real-time output |
| **Socket.IO for simulation** | HTTP isn't suitable for long-running solver execution with real-time output; WebSocket provides bidirectional streaming |
| **Threading on Windows, eventlet on Linux** | eventlet doesn't work reliably on Windows; threading mode works for development; eventlet provides better concurrency in production |
| **JSON Schema validation** | Declarative input validation; catches malformed requests before they reach business logic; clear error messages |
| **`safe_join()` everywhere** | All file operations must be sandboxed to prevent path traversal — the #1 critical vulnerability found in the security audit |
| **UUID temp files** | Unpredictable filenames prevent temp file guessing attacks |
| **json-splitter.py as subprocess** | Large VFP files (100 MB+) need streaming processing; isolating this in a subprocess prevents memory issues in the Flask process |
| **Module-level process reference** | Simple approach for single-user development; noted as needing per-session map for multi-user production |
| **Wine compatibility layer** | Enables Linux deployment of Windows-only Fortran solver binaries without recompilation |

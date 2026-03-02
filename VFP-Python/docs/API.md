# FlowVFP Backend API Reference

**Base URL (production):**  
`https://vfp-solver-gngfaahkh2fkbbhh.uksouth-01.azurewebsites.net`

**Base URL (development):**  
`http://127.0.0.1:5000`

---

## Authentication

The API currently uses no authentication tokens.  All endpoints are protected by:

- CORS (origin allowlist)
- Rate limiting (per-IP)
- Input validation (JSON Schema)

---

## Common response codes

| Code | Meaning |
| --- | --- |
| 200 | Success |
| 400 | Bad request / missing fields |
| 413 | Uploaded file exceeds size limit |
| 422 | JSON body failed schema validation |
| 429 | Rate limit exceeded |
| 500 | Internal server error (detail logged server-side) |

---

## Health

### `GET /health`

Liveness probe.

**Response 200:**

```json
{
  "status": "healthy",
  "version": "2.0.0",
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```

### `GET /ping`

Simple availability check.

**Response 200:**

```json
{ "pong": true }
```

---

## Geometry  `/api/geometry`

### `POST /api/geometry/import`

Upload a `.GEO` file, parse it, and return structured sections.

**Request:** `multipart/form-data`  

| Field | Type | Description |
| --- | --- | --- |
| `file` | File | `.GEO` geometry file |

**Response 200:**

```json
{
  "sections": [
    {
      "y": 0.0,
      "chord": 1.0,
      "twist": 0.0,
      "x_le": 0.0,
      "thickness": 0.12,
      "camber": 0.04
    }
  ],
  "wing_specs": {
    "span": 10.0,
    "root_chord": 1.5,
    "tip_chord": 0.75,
    "sweep_angle": 25.0,
    "dihedral_angle": 3.0,
    "twist_angle": -2.0,
    "num_sections": 10
  },
  "file_name": "wing.GEO"
}
```

---

### `POST /api/geometry/export`

Generate a `.GEO` file from section data.

**Request:** `application/json`

```json
{
  "sections": [ ... ],
  "wing_specs": { ... },
  "file_name": "output.GEO"
}
```

**Response 200** – `application/octet-stream` binary `.GEO` file download.

---

### `POST /api/geometry/fpcon`

Run the FPCON mesh generator and return the `.MAP` file content.

**Request:** `application/json` – same shape as `/export`.

**Response 200:**

```json
{
  "success": true,
  "map_content": "<full .MAP text content>",
  "message": "FPCON completed successfully"
}
```

---

### `POST /api/geometry/compute-desired`

Compute the AoA required to achieve a target CL.

**Request:** `application/json`

```json
{
  "sections":   [ ... ],
  "wing_specs": { ... },
  "target_cl":  0.5
}
```

**Response 200:**

```json
{
  "aoa":         3.2,
  "cl_achieved": 0.499,
  "cd":          0.023,
  "cm":          -0.05
}
```

---

### `POST /api/geometry/interpolate-parameter`

Interpolate a spanwise parameter to per-section values.

**Request:** `application/json`

```json
{
  "y_values":   [0.0, 0.5, 1.0],
  "param_values": [1.5, 1.2, 0.75],
  "target_y":   [0.0, 0.25, 0.5, 0.75, 1.0],
  "method":     "linear"
}
```

**Response 200:**

```json
{
  "values":    [1.5, 1.35, 1.2, 0.975, 0.75],
  "parameter": "chord",
  "method":    "linear"
}
```

---

## Simulation  `/api/simulation`

> **Note:** The solver is started via Socket.IO `start_simulation` event, not REST.  
> These endpoints manage file access around the simulation.

### `GET /api/simulation/folder/<sim_name>`

List output files for a simulation.

**Path parameter:** `sim_name` – alphanumeric + hyphens only.

**Response 200:**

```json
{
  "sim_name": "my-sim-001",
  "files": [
    { "name": "results.CP",     "size": 12400, "modified": "2025-01-01T10:00:00Z" },
    { "name": "results.FORCES", "size": 850,   "modified": "2025-01-01T10:00:01Z" }
  ],
  "groups": {
    "cp":     ["results.CP"],
    "forces": ["results.FORCES"],
    "vis":    [],
    "dat":    ["input.DAT"]
  }
}
```

---

### `POST /api/simulation/file-content`

Retrieve a text file from a simulation folder.

**Request:** `application/json`

```json
{
  "sim_name":  "my-sim-001",
  "file_name": "results.CP"
}
```

**Response 200:**

```json
{
  "content":   "<full file text>",
  "file_name": "results.CP",
  "sim_name":  "my-sim-001"
}
```

---

### `POST /api/simulation/upload-data`

Store post-processed VFP data back to the simulation folder.

**Request:** `application/json`

```json
{
  "vfp_data":  { ... },
  "sim_name":  "my-sim-001",
  "file_name": "processed.json"
}
```

**Response 200:**

```json
{
  "success":   true,
  "message":   "Data uploaded successfully",
  "sim_name":  "my-sim-001",
  "file_name": "processed.json"
}
```

---

## Files  `/api/files`

### `POST /api/files/upload-vfp`

Upload a `.vfp` archive (ZIP bundle of simulation outputs).

**Request:** `multipart/form-data`

| Field | Type | Description |
| --- | --- | --- |
| `file` | File | `.vfp` archive |

**Response 200:**

```json
{
  "session_id": "3f1e2b4c-...",
  "manifest": {
    "sim_name": "DC304-Wing",
    "version":  "1.0",
    "files":    ["results.CP", "results.FORCES"]
  }
}
```

---

### `POST /api/files/vfp-result-files`

List files in an uploaded VFP session.

**Request:** `application/json`

```json
{ "session_id": "3f1e2b4c-..." }
```

**Response 200:**

```json
{
  "session_id": "3f1e2b4c-...",
  "manifest":   { ... },
  "files":      ["results.CP", "results.FORCES", "input.DAT"]
}
```

---

## Post-processing  `/api/post`

### `POST /api/post/parse-cp`

Parse a `.CP` pressure coefficient file.

**Request:** `multipart/form-data` – field `file`

**Response 200:**

```json
{
  "cp_data": {
    "alpha": 4.0,
    "mach":  0.8,
    "sections": [
      {
        "y": 0.0,
        "x_c": [0.0, 0.1, 0.2],
        "cp_upper": [-0.5, -0.3, -0.1],
        "cp_lower": [0.2, 0.15, 0.1]
      }
    ]
  },
  "file_name": "results.CP"
}
```

---

### `POST /api/post/parse-forces`

Parse a `.FORCES` aerodynamic forces file.

**Request:** `multipart/form-data` – field `file`

**Response 200:**

```json
{
  "forces": [
    {
      "alpha": 4.0,
      "cl":    0.48,
      "cd":    0.022,
      "cm":    -0.04,
      "cl_cd": 21.8
    }
  ],
  "file_name": "results.FORCES"
}
```

---

### `POST /api/post/parse-dat`

Parse a `.DAT` flow-conditions file.

**Request:** `multipart/form-data` – field `file`

**Response 200:**

```json
{
  "content":   "<raw file text>",
  "file_name": "input.DAT"
}
```

---

### `POST /api/post/parse-vis`

Parse a `.VIS` boundary-layer file.

**Request:** `multipart/form-data` – field `file`

**Response 200:**

```json
{
  "sections": [
    {
      "y":      0.0,
      "x_c":    [0.0, 0.1],
      "theta":  [0.001, 0.002],
      "delta":  [0.005, 0.008],
      "cf":     [0.004, 0.003]
    }
  ],
  "file_name": "results.VIS"
}
```

---

### `POST /api/post/contour-grid`

Build a surface contour grid from VFP session data.

**Request:** `application/json`

```json
{
  "session_id": "3f1e2b4c-...",
  "file_name":  "results.CP",
  "component":  "cp_upper"
}
```

**Response 200:**

```json
{
  "x":        [[0.0, 0.1], [0.0, 0.1]],
  "y":        [[0.0, 0.0], [0.1, 0.1]],
  "z":        [[0.0, 0.0], [0.0, 0.0]],
  "values":   [[-0.5, -0.3], [-0.4, -0.2]],
  "component": "cp_upper"
}
```

---

### `POST /api/post/tail-downwash`

Compute horizontal-tail downwash angle over an alpha sweep.

**Request:** `application/json`

```json
{
  "session_id":   "3f1e2b4c-...",
  "forces_file":  "results.FORCES",
  "alpha_range":  [0, 10]
}
```

**Response 200:**

```json
{
  "downwash_angle": [0.5, 0.8, 1.1, 1.4, 1.7],
  "alpha":          [0, 2, 4, 6, 8],
  "epsilon_alpha":  0.32
}
```

---

## ProWiM  `/api/prowim`

### `POST /api/prowim/compute`

Compute propeller–wing interaction using the ProWiM model.

**Request:** `application/json`

```json
{
  "v_inf":         50.0,
  "rpm":           2400,
  "prop_diameter": 1.8,
  "num_blades":    3,
  "wing_span":     12.0,
  "prop_y_loc":    2.5,
  "alpha":         4.0,
  "cl_2d":         [0.8, 0.9, 1.0],
  "y_stations":    [0.0, 0.5, 1.0]
}
```

**Response 200:**

```json
{
  "results": [
    { "y": 0.0, "delta_cl": 0.12, "delta_cd": 0.003, "v_local": 55.0 }
  ],
  "cl_total":   0.62,
  "cd_total":   0.025,
  "efficiency": 0.88
}
```

---

## Socket.IO events

Connect to the same server URL as the REST API.

### Client → Server

| Event | Payload | Description |
| --- | --- | --- |
| `ping` | *(none)* | Connection keepalive |
| `start_simulation` | `{ vfp_data, sim_name, file_name? }` | Start VFP solver |
| `stop_simulation` | *(none)* | Kill running solver |
| `download` | `{ sim_name }` | Download result ZIP |
| `get_simulation_folder` | `{ sim_name }` | List output files |

### Server → Client

| Event | Payload | Description |
| --- | --- | --- |
| `pong` | `{ pong: true, sid }` | Response to ping |
| `simulation_output` | `{ line }` | Stdout line from solver |
| `simulation_complete` | `{ sim_name, exit_code }` | Solver finished |
| `simulation_error` | `{ error }` | Solver crashed |
| `simulation_stopped` | `{ message }` | Solver killed |
| `simulation_folder` | `{ sim_name, files }` | Response to folder query |
| `download_ready` | `{ url }` | ZIP ready for download |
| `download_error` | `{ error }` | ZIP creation failed |

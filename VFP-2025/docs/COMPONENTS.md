# Frontend Component & Architecture Reference

## Module overview

```
src/
├─ main.tsx                    Vite entry point
├─ App.tsx                     Root component, routing, global providers
├─ types/index.ts              Domain TypeScript interfaces
├─ api/                        HTTP + WebSocket service layer
├─ hooks/                      Reusable React hooks
├─ store/                      React context (global state)
└─ components/                 UI components
    ├─ ui/                     Generic reusable UI
    ├─ LandingPage.js          Home / navigation hub
    ├─ GeometryModule.js       Wing geometry editor
    ├─ SimulationRun.js        Solver control panel
    ├─ PostProcessing.js       Results & plots
    ├─ BoundaryLayerData.js    Boundary-layer charts
    ├─ ContourPlot.js          3-D surface contour
    ├─ Plot2D.js               2-D Plotly wrapper
    ├─ Plot3D.js               3-D Plotly wrapper
    ├─ ProWiM.js               Propeller-wing interaction
    ├─ Research.js             Literature / references page
    └─ Solver.js               Solver configuration form
```

---

## Routing

Routes are defined in `App.tsx` using React Router v6:

| Path          | Component        |
|---------------|------------------|
| `/`           | `LandingPage`    |
| `/geometry`   | `GeometryModule` |
| `/simulation` | `SimulationRun`  |
| `/post`       | `PostProcessing` |
| `/research`   | `Research`       |
| `/prowim`     | `ProWiM`         |
| `*`           | → `/` (redirect) |

All routes are **lazy-loaded** via `React.lazy` to keep the initial bundle small.

---

## Global state (Context)

### `VfpDataContext`  (`src/store/VfpDataContext.tsx`)

Holds the currently loaded `.vfp` archive session.

| Value           | Type                   | Description                      |
|-----------------|------------------------|----------------------------------|
| `sessionId`     | `string \| null`       | UUID from the upload response    |
| `manifest`      | `VfpManifest \| null`  | Archive manifest                 |
| `vfpData`       | `VfpData \| null`      | Parsed VFP data                  |
| `isLoaded`      | `boolean`              | True when sessionId is set       |

Methods: `setSessionId`, `setManifest`, `setVfpData`, `applyUploadResponse`, `reset`.

Usage:
```tsx
import { useVfpDataContext } from '../store';

const { sessionId, applyUploadResponse } = useVfpDataContext();
```

---

### `SimulationDataContext`  (`src/store/SimulationDataContext.tsx`)

Persists simulation configuration across the workflow.

| Value           | Type                       | Description               |
|-----------------|----------------------------|---------------------------|
| `simName`       | `string`                   | Simulation identifier     |
| `formData`      | `SimulationFormData \| null` | Solver form values      |
| `fileConfig`    | `FileConfig \| null`       | DAT / MAP file paths      |
| `inputFiles`    | `InputFiles \| null`       | Uploaded file references  |
| `lastExitCode`  | `number \| null`           | Last solver exit code     |

Usage:
```tsx
import { useSimulationDataContext } from '../store';

const { simName, setSimName, setFormData } = useSimulationDataContext();
```

---

## Hooks

### `useGeometry`  (`src/hooks/useGeometry.ts`)

All state and server interactions for the Geometry Module.

```ts
const {
  sections, wingSpecs, fileName, loading, error,
  importGeoFile, exportGeoFile, fpcon,
  computeDesiredAoA, interpolate,
  setSections, setWingSpecs, setFileName, clearError,
} = useGeometry();
```

| Method              | Description                                      |
|---------------------|--------------------------------------------------|
| `importGeoFile(f)`  | Upload + parse a `.GEO` file                    |
| `exportGeoFile()`   | Download a `.GEO` file from current state        |
| `fpcon()`           | Run FPCON mesh generator                         |
| `computeDesiredAoA(cl)` | Compute AoA for target CL                   |
| `interpolate(req)`  | Interpolate a spanwise parameter                 |

---

### `useSimulation`  (`src/hooks/useSimulation.ts`)

Drives the VFP solver over Socket.IO.

```ts
const {
  status, outputLines, exitCode, error, connected,
  startSimulation, stopSimulation, clearOutput,
} = useSimulation();
```

| State      | Type               | Values                                             |
|------------|--------------------|----------------------------------------------------|
| `status`   | `SimulationStatus` | `idle` `connecting` `running` `complete` `error` `stopped` |

---

### `useSocket`  (`src/hooks/useSocket.ts`)

Low-level Socket.IO connection lifecycle.

```ts
const { socket, connected, error, connect, disconnect } = useSocket();
```

Use `useSimulation` instead unless you need raw Socket.IO access.

---

### `useVfpData`  (`src/hooks/useVfpData.ts`)

Load and cache post-processing data.

```ts
const {
  cpData, forces, datContent, visData, contourGrid, tailDownwash,
  loading, error,
  loadCp, loadForces, loadDat, loadVis, loadContourGrid, loadTailDownwash,
  clearError, resetAll,
} = useVfpData();
```

---

## API service layer  (`src/api/`)

All HTTP calls go through the typed service modules.  
Do **not** call `fetch()` directly from components.

| Module               | Purpose                       |
|----------------------|-------------------------------|
| `client.ts`          | Base fetch wrapper            |
| `geometry.ts`        | `/api/geometry/*` calls       |
| `simulation.ts`      | `/api/simulation/*` calls     |
| `files.ts`           | `/api/files/*` calls          |
| `postprocessing.ts`  | `/api/post/*` calls           |
| `prowim.ts`          | `/api/prowim/*` calls         |
| `socket.ts`          | `createSocket()` factory      |

Error handling: all functions throw `ApiRequestError` (from `client.ts`) on
non-2xx responses, containing `status` and optional `detail` fields.

```ts
import { importGeo, ApiRequestError } from '../api';

try {
  const data = await importGeo(file);
} catch (err) {
  if (err instanceof ApiRequestError && err.status === 422) {
    // validation error
  }
}
```

---

## ErrorBoundary  (`src/components/ui/ErrorBoundary.tsx`)

Class component – catches render errors in child trees.

```tsx
// Wrap any section that might fail
<ErrorBoundary>
  <ContourPlot />
</ErrorBoundary>

// Custom fallback
<ErrorBoundary fallback={<p>Plot unavailable</p>}>
  <ContourPlot />
</ErrorBoundary>

// Error telemetry
<ErrorBoundary onError={(err, info) => reportToSentry(err, info)}>
  <App />
</ErrorBoundary>
```

---

## TypeScript types  (`src/types/index.ts`)

Key domain types:

| Type                    | Description                             |
|-------------------------|-----------------------------------------|
| `GeoSection`            | Single wing cross-section (y, chord…)   |
| `WingSpecs`             | Overall wing parameters                 |
| `SimulationFormData`    | Solver input form values                |
| `VfpData`               | Uploaded/processed VFP archive data     |
| `CpData`                | Pressure coefficient dataset            |
| `ForceCoefficients`     | CL, CD, CM per alpha                   |
| `ProWiMRequest`         | ProWiM computation input                |
| `ApiError`              | Serialised API error                    |

---

## Path aliases  (`vite.config.js` + `tsconfig.json`)

| Alias          | Resolves to                 |
|----------------|----------------------------|
| `@`            | `src/`                     |
| `@api`         | `src/api/`                 |
| `@components`  | `src/components/`          |
| `@hooks`       | `src/hooks/`               |
| `@types`       | `src/types/`               |
| `@utils`       | `src/utils/`               |
| `@store`       | `src/store/`               |

Usage: `import { useGeometry } from '@hooks/useGeometry'`

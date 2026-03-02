# VFP-2025 — Frontend Developer Guide

> React 19 / TypeScript / Vite frontend for the FlowVFP aerodynamic analysis application.

---

## Table of Contents

- [VFP-2025 — Frontend Developer Guide](#vfp-2025--frontend-developer-guide)
  - [Table of Contents](#table-of-contents)
  - [Quick Start](#quick-start)
  - [Technology Stack](#technology-stack)
  - [Project Structure](#project-structure)
  - [Architecture Overview](#architecture-overview)
    - [Application Shell](#application-shell)
    - [Routing](#routing)
    - [State Management](#state-management)
      - [VfpDataContext (`src/store/VfpDataContext.tsx`)](#vfpdatacontext-srcstorevfpdatacontexttsx)
      - [SimulationDataContext (`src/store/SimulationDataContext.tsx`)](#simulationdatacontext-srcstoresimulationdatacontexttsx)
    - [API Layer](#api-layer)
      - [`client.ts` — Core HTTP Client](#clientts--core-http-client)
      - [Domain API Modules](#domain-api-modules)
      - [`socket.ts` — Socket.IO Client](#socketts--socketio-client)
    - [Custom Hooks](#custom-hooks)
    - [Components](#components)
    - [Utilities](#utilities)
      - [Streaming JSON Parsers (Memory-Safe Large File Handling)](#streaming-json-parsers-memory-safe-large-file-handling)
      - [IndexedDB Storage](#indexeddb-storage)
    - [Type System](#type-system)
  - [Build Configuration](#build-configuration)
    - [Vite](#vite)
    - [TypeScript](#typescript)
    - [Tailwind CSS](#tailwind-css)
    - [Path Aliases](#path-aliases)
  - [Development Workflow](#development-workflow)
    - [Dev server proxy](#dev-server-proxy)
    - [Adding a new page](#adding-a-new-page)
  - [Testing](#testing)
    - [Current test coverage](#current-test-coverage)
  - [Production Build \& Deployment](#production-build--deployment)
    - [GitHub Pages Deployment](#github-pages-deployment)
  - [Environment Variables](#environment-variables)
  - [Legacy Code \& Migration Notes](#legacy-code--migration-notes)
  - [Key Design Decisions](#key-design-decisions)

---

## Quick Start

```bash
# Prerequisites: Node.js ≥ 20 LTS, npm ≥ 10
# The backend (VFP-Python) must be running at http://127.0.0.1:5000

npm install

# Copy environment template (if provided)
copy .env.example .env.local        # Windows
# cp .env.example .env.local        # macOS / Linux

npm run dev                          # → http://localhost:3000
```

The Vite dev server proxies `/api/*` and `/socket.io/*` requests to the Flask backend at `http://127.0.0.1:5000`.

---

## Technology Stack

| Category | Library | Version | Purpose |
| --- | --- | --- | --- |
| **Framework** | React | 19 | UI component library |
| **Language** | TypeScript | 5.6 | Type-safe JavaScript |
| **Bundler** | Vite | 7.1 | Dev server, HMR, production builds |
| **Styling** | Tailwind CSS | 3.4 | Utility-first CSS framework |
| **Routing** | react-router-dom | 7 | Client-side routing |
| **2D Charts** | Plotly.js | 3 | Interactive 2D plots (Cp, forces, planform) |
| **3D Rendering** | Three.js | 0.176 | 3D wing model visualisation |
| **Contour Plots** | D3.js | 7.9 | 2D contour rendering |
| **Supplementary Charts** | Chart.js | 4.5 | Lightweight supplementary charts |
| **WebSocket** | socket.io-client | 4.8 | Real-time simulation communication |
| **Streaming JSON** | @streamparser/json | 0.0.22 | Parse 100 MB+ VFP files without exhausting memory |
| **Icons** | lucide-react, @tabler/icons-react | — | UI icons |
| **Testing** | Vitest, @testing-library/react | 3 / 16 | Unit and component tests |
| **Linting** | ESLint | 9 | Code quality |

---

## Project Structure

```text
VFP-2025/
├── public/                     Static assets (index.html, manifest.json, robots.txt)
├── build/                      Production build output (gitignored in dev)
├── docs/
│   └── COMPONENTS.md           Detailed component-level reference
├── src/
│   ├── main.tsx                Vite entry point — mounts <App /> to #root
│   ├── App.tsx                 Root component: providers, router, lazy routes
│   ├── App.css                 (empty — styles in index.css / Tailwind)
│   ├── index.css               Tailwind directives (@tailwind base/components/utilities)
│   │
│   ├── types/
│   │   └── index.ts            All domain TypeScript interfaces and types
│   │
│   ├── api/                    HTTP and WebSocket service layer
│   │   ├── client.ts           Core fetch wrapper (ApiResponse<T>, error handling)
│   │   ├── geometry.ts         Geometry endpoints (import, export, fpcon, interpolate)
│   │   ├── simulation.ts       Simulation endpoints (start, upload, file listing)
│   │   ├── files.ts            VFP file upload and result listing
│   │   ├── postprocessing.ts   Post-processing parsers (Cp, forces, vis, contour)
│   │   ├── prowim.ts           ProWiM computation endpoint
│   │   └── socket.ts           Socket.IO factory with typed events
│   │
│   ├── hooks/                  Custom React hooks
│   │   ├── useGeometry.ts      Geometry state + API operations
│   │   ├── useSimulation.ts    Simulation lifecycle (socket, status machine)
│   │   ├── useSocket.ts        Low-level Socket.IO connection management
│   │   └── useVfpData.ts       Post-processing data state + loaders
│   │
│   ├── store/                  React Context providers (global state)
│   │   ├── VfpDataContext.tsx   VFP session data (sessionId, manifest, vfpData)
│   │   └── SimulationDataContext.tsx  Simulation form state + file config
│   │
│   ├── components/             UI components (one per route/feature)
│   │   ├── LandingPage.jsx     Home page
│   │   ├── GeometryModule.jsx  Geometry import/edit/export + FPCON
│   │   ├── RunSolver.jsx       Solver execution interface
│   │   ├── SimulationRun.jsx   Simulation config and monitoring
│   │   ├── VFPPost.js          Post-processing dashboard
│   │   ├── PostProcessing.jsx  Post-processing module
│   │   ├── ContourPlot.jsx     2D contour visualisation
│   │   ├── BoundaryLayerData.jsx  Boundary-layer data viewer
│   │   ├── Research.jsx        Research module
│   │   ├── ProWiM.jsx          Propeller-wing interaction
│   │   ├── Prowim3Dmodel.jsx   3D ProWiM visualisation
│   │   ├── Plot2D.jsx          Plotly 2D chart wrapper
│   │   ├── Plot3D.jsx          Three.js 3D wing viewer
│   │   ├── VfpDumpSelector.jsx Continuation run file selector
│   │   ├── vfpDataContext.jsx  Legacy VFP data provider (JSX)
│   │   ├── SimulationDataContext.jsx  Legacy simulation context (JSX)
│   │   └── ui/
│   │       └── ErrorBoundary.tsx  React error boundary (class component)
│   │
│   ├── utils/                  Non-React utility modules
│   │   ├── vfpParser.js        Stream-parse VFP JSON → extract formData + dumps
│   │   ├── vfpStorage.js       IndexedDB store for continuation-run dump files
│   │   ├── vfpPostParser.js    Stream-parse VFP JSON → extract result files for post
│   │   ├── vfpPostStorage.js   IndexedDB store for post-processing result files
│   │   ├── fetch.js            Legacy fetch wrapper (being replaced by api/client.ts)
│   │   └── socket.js           Legacy Socket.IO connector (being replaced by api/socket.ts)
│   │
│   └── tests/                  Test files
│       ├── setup.ts            Vitest global setup (mocks, jest-dom)
│       ├── api.client.test.ts  API client unit tests
│       ├── ErrorBoundary.test.tsx  Error boundary tests
│       └── useSimulation.test.ts  Simulation hook tests
│
├── index.html                  Vite HTML template (references src/main.tsx)
├── package.json                Dependencies, scripts, metadata
├── vite.config.js              Vite configuration (proxy, aliases, chunking)
├── tsconfig.json               TypeScript configuration
├── tailwind.config.js          Tailwind CSS configuration
├── postcss.config.js           PostCSS plugins (Tailwind + Autoprefixer)
└── README.md                   This file
```

---

## Architecture Overview

### Application Shell

The application mounts in `src/main.tsx` and renders the root component tree:

```text
<React.StrictMode>
  └── <App />
        └── <ErrorBoundary>
              └── <VfpDataProvider>           ← Global VFP session state
                    └── <SimulationDataProvider>  ← Simulation form state
                          └── <BrowserRouter>
                                └── <Routes>   ← Lazy-loaded page components
```

All pages are wrapped in two context providers and an error boundary. If any component throws, `ErrorBoundary` renders a crash fallback with a recovery button.

### Routing

Nine routes are defined in `App.tsx`, all **lazy-loaded** with `React.lazy()` and wrapped in `<Suspense>`:

| Path | Component | Module |
| --- | --- | --- |
| `/` | `LandingPage` | — |
| `/solver` | `RunSolver` | Solver |
| `/geometry` | `GeometryModule` | Geometry |
| `/simulation` | `SimulationRun` | Solver |
| `/post` | `VFPPost` | Post-processing |
| `/research` | `Research` | Research |
| `/prowim` | `ProWiM` | ProWiM |
| `/post-processing/contour-plot` | `ContourPlot` | Post-processing |
| `/post-processing/boundary-layer` | `BoundaryLayerData` | Post-processing |

A catch-all `*` route redirects to `/`.

### State Management

The application uses **React Context** for global state — no external state management library (Redux, Zustand, etc.).

#### VfpDataContext (`src/store/VfpDataContext.tsx`)

Provides the main VFP session state:

| Field | Type | Description |
| --- | --- | --- |
| `sessionId` | `string` | Current session identifier |
| `manifest` | `VfpManifest \| null` | Split-JSON manifest for uploaded VFP files |
| `vfpData` | `VfpData \| null` | Complete VFP data (formData + inputFiles + results) |

Methods: `applyUploadResponse(response)` — merges upload results into state; `reset()` — clears all data.

#### SimulationDataContext (`src/store/SimulationDataContext.tsx`)

Provides simulation configuration state:

| Field | Type | Description |
| --- | --- | --- |
| `simName` | `string` | Simulation name |
| `formData` | `SimulationFormData` | AoA, Mach, auto-runner settings, continuation config |
| `fileConfig` | `FileConfig` | Wing/tail/body file names |
| `inputFiles` | `InputFiles` | Uploaded file content |
| `lastExitCode` | `number \| null` | Solver exit code |

### API Layer

All backend communication is centralised in `src/api/`. The modern TypeScript layer is progressively replacing the legacy `utils/fetch.js`.

#### `client.ts` — Core HTTP Client

```typescript
type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: string };

get<T>(path: string): Promise<ApiResponse<T>>
post<T>(path: string, body: object): Promise<ApiResponse<T>>
postForm<T>(path: string, formData: FormData): Promise<ApiResponse<T>>
```

- **Base URL detection**: In development, the URL is empty (requests go through Vite's proxy). In production, it auto-detects the Azure deployment URL or uses `VITE_API_URL`.
- **Error wrapping**: All responses are normalised to `ApiResponse<T>`. Network errors, non-2xx status codes, and JSON parse failures are caught and returned as `{ ok: false, error: string }`.

#### Domain API Modules

| Module | Endpoints | Key functions |
| --- | --- | --- |
| `geometry.ts` | `/api/geometry/*` | `importGeo()`, `exportGeo()`, `runFpcon()`, `computeDesired()`, `interpolateParameter()` |
| `simulation.ts` | `/api/simulation/*` | `getSimulationFolder()`, `getFileContent()`, `uploadVfpData()` |
| `files.ts` | `/api/files/*` | `uploadVfp()`, `getVfpResultFiles()` |
| `postprocessing.ts` | `/api/post/*` | `parseCp()`, `parseForces()`, `parseDat()`, `parseVis()`, `parseVfpFile()`, `getContourGrid()`, `computeTailDownwash()` |
| `prowim.ts` | `/api/prowim/*` | `computeProWiM()` |

#### `socket.ts` — Socket.IO Client

```typescript
interface ServerToClientEvents {
  message: (data: string) => void;
  simulation_finished: (data: { exit_code: number; message: string }) => void;
  simulation_error: (data: { error: string }) => void;
  pong: () => void;
}

interface ClientToServerEvents {
  start_simulation: (data: object) => void;
  stop_simulation: () => void;
  ping: () => void;
}
```

- **Dev mode**: Uses HTTP long-polling only (Werkzeug dev server cannot upgrade to WebSocket).
- **Production**: Uses polling + WebSocket upgrade.
- `createSocket()` factory returns a typed `Socket<ServerToClientEvents, ClientToServerEvents>`.

### Custom Hooks

| Hook | File | Responsibilities |
| --- | --- | --- |
| `useGeometry` | `hooks/useGeometry.ts` | Manages `sections[]` and `wingSpecs` state; wraps `importGeoFile()`, `exportGeoFile()`, `fpcon()`, `computeDesiredAoA()`, `interpolate()` |
| `useSimulation` | `hooks/useSimulation.ts` | Full simulation lifecycle via Socket.IO. Status state machine: `idle` → `connecting` → `running` → `complete` / `error` / `stopped`. Provides `startSimulation()`, `stopSimulation()`, `clearOutput()`. Collects solver output lines. |
| `useSocket` | `hooks/useSocket.ts` | Low-level Socket.IO connection management (connect, disconnect, event binding) |
| `useVfpData` | `hooks/useVfpData.ts` | Post-processing data state: `cpData`, `forces`, `datContent`, `visData`, `contourGrid`, `tailDownwash` + loader functions for each |

### Components

Components are **feature-based** (one component per application page/feature), not atomic UI components. Each component is self-contained and manages its own local state, using hooks and context for shared state.

**Visualisation components:**

| Component | Technology | Description |
| --- | --- | --- |
| `Plot2D.jsx` | Plotly.js | Generic 2D chart — planform, section profiles, twist/dihedral distributions, Cp plots, force distributions |
| `Plot3D.jsx` | Three.js | 3D wireframe wing model with orbit controls, axis helpers, section highlighting |
| `ContourPlot.jsx` | D3.js | 2D filled contour map of flow variables across wing planform |
| `Prowim3Dmodel.jsx` | Three.js | 3D visualisation of propeller-wing interaction geometry |

**Page components:**

| Component | Route | Description |
| --- | --- | --- |
| `LandingPage.jsx` | `/` | Application home with module navigation |
| `GeometryModule.jsx` | `/geometry` | Full geometry workflow: import, edit, FPCON, export |
| `RunSolver.jsx` | `/solver` | Solver execution with file upload and live terminal |
| `SimulationRun.jsx` | `/simulation` | Simulation configuration (AoA, Mach, files, auto-runner) |
| `VFPPost.js` | `/post` | Post-processing dashboard: upload .vfp, view results |
| `BoundaryLayerData.jsx` | `/post-processing/boundary-layer` | Boundary-layer data viewer |
| `ProWiM.jsx` | `/prowim` | ProWiM computation interface |
| `Research.jsx` | `/research` | Research module |

### Utilities

#### Streaming JSON Parsers (Memory-Safe Large File Handling)

FlowVFP result files (`.vfp`) can exceed 100 MB. Standard `JSON.parse()` would crash the browser tab. Two streaming parsers solve this:

| Utility | Purpose | Storage |
| --- | --- | --- |
| `vfpParser.js` | Parse `.vfp` → extract `formData` + 7 fort dump files for continuation runs | `vfpStorage.js` (IndexedDB) |
| `vfpPostParser.js` | Parse `.vfp` → extract all result files (Cp, forces, vis, dat) for post-processing | `vfpPostStorage.js` (IndexedDB) |

Both use `@streamparser/json` to process the file in a single streaming pass. Data is flushed to IndexedDB in chunks (64 KB), keeping browser memory bounded.

#### IndexedDB Storage

Two separate IndexedDB databases avoid cross-contamination between solver and post-processing data:

| Store | Database | Stores |
| --- | --- | --- |
| `vfpStorage.js` | `vfp-dump-store` | Fort dump files (fort11, fort15, fort21, fort50, fort51, fort52, fort55) for continuation runs |
| `vfpPostStorage.js` | `vfp-post-store` | Result files (Cp, forces, vis, dat, meta) for post-processing |

Both are singletons with promise-based APIs: `store()`, `get()`, `list()`, `clear()`.

### Type System

All domain types are defined in `src/types/index.ts` (247 lines). Key types:

```typescript
// Wing geometry
GeoSection         // Wing section: coordinates, parameters (YSECT, G1SECT, TWIST, HSECT, ...)
SectionPlotData    // Interpolated airfoil (xus, zus, xls, zls, camber, t_c)
WingSpecs          // Computed metrics (AR, taper, span, sweep angles)

// Interpolation
InterpolationMethod // 'linear' | 'quadratic' | 'elliptical' | 'cosine' | 'power' | 'schuemann' | 'hermite' | 'exponential'
InterpolateParameterRequest

// Simulation
SimulationFormData  // simName, aoa, mach, autoRunner settings, continuation config
FileConfig          // Wing/tail/body file names (GEO, MAP, DAT)
InputFiles          // File name + content pairs per configuration

// Results
CpSection / CpData        // Pressure coefficient distributions
ForceCoefficients          // CL, CD, CM, CDi, CDv, CDw
SimulationFile / FileGroups // File listing structures

// Data packaging
VfpData            // formData + inputFiles + results
UploadVfpResponse  // Server response after VFP upload
VfpManifest        // Split-JSON manifest
```

---

## Build Configuration

### Vite

Key settings in `vite.config.js`:

- **Base path**: `/VFP-2025` (for GitHub Pages sub-path deployment)
- **Dev server**: Port 3000
- **Proxy rules** (dev only):
  - `/api/*` → `http://127.0.0.1:5000`
  - `/socket.io/*` → `http://127.0.0.1:5000` (WebSocket enabled)
  - Legacy route proxies for direct solver/fpcon paths
- **Chunk splitting** (production):
  - `react-vendor` — React + ReactDOM
  - `plotly-vendor` — Plotly.js (largest chunk)
  - `charts-vendor` — Chart.js
  - `three-vendor` — Three.js
  - `d3-vendor` — D3.js

### TypeScript

`tsconfig.json` targets **ES2020** with strict mode enabled. `allowJs: true` permits the legacy `.jsx`/`.js` components to coexist with `.tsx`/`.ts` files during migration.

### Tailwind CSS

Standard setup scanning `./index.html` and `./src/**/*.{js,ts,jsx,tsx}`. PostCSS pipeline: `tailwindcss` → `autoprefixer`.

### Path Aliases

Defined in both `vite.config.js` and `tsconfig.json`:

| Alias | Maps To |
| --- | --- |
| `@api/*` | `src/api/*` |
| `@components/*` | `src/components/*` |
| `@hooks/*` | `src/hooks/*` |
| `@types/*` | `src/types/*` |
| `@utils/*` | `src/utils/*` |
| `@store/*` | `src/store/*` |

---

## Development Workflow

| Task | Command |
| --- | --- |
| Start dev server | `npm run dev` |
| Run tests | `npm test` |
| Run tests in watch mode | `npx vitest --watch` |
| Lint | `npm run lint` |
| Type-check | `npx tsc --noEmit` |
| Production build | `npm run build` |
| Preview production build | `npm run preview` |

### Dev server proxy

During development, the Vite dev server runs on port 3000 and proxies API calls to the Flask backend on port 5000. This avoids CORS issues and mirrors the production setup where both are served behind a single domain.

```text
Browser (localhost:3000)
  ├── /api/*         ──proxy──▶  Flask (localhost:5000)
  ├── /socket.io/*   ──proxy──▶  Flask (localhost:5000)
  └── /* (all else)  ──serve──▶  Vite HMR (src/)
```

### Adding a new page

1. Create `src/components/MyPage.tsx`
2. Add a lazy-loaded route in `App.tsx`:

    ```tsx
    const MyPage = lazy(() => import('@components/MyPage'));
    // Inside <Routes>:
    <Route path="/my-page" element={<MyPage />} />
    ```

3. If it needs API calls, create `src/api/myfeature.ts` using the `client.ts` helpers
4. If it needs shared state, add a context or use an existing one
5. If it has complex logic, extract a `src/hooks/useMyFeature.ts` hook

---

## Testing

Tests use **Vitest** with **jsdom** environment and **@testing-library/react**.

```bash
npm test                    # Single run
npx vitest --watch          # Watch mode
npx vitest --coverage       # Coverage report
```

Test setup (`src/tests/setup.ts`):

- Imports `@testing-library/jest-dom` for DOM matchers
- Mocks `import.meta.env` for test mode detection

### Current test coverage

| Test File | What it covers |
| --- | --- |
| `api.client.test.ts` | `get()`, `post()`, `postForm()` — success, error, network failure |
| `ErrorBoundary.test.tsx` | Error catching, fallback rendering, reset functionality |
| `useSimulation.test.ts` | Status state machine, output collection, socket event handling |

---

## Production Build & Deployment

```bash
npm run build
# Output → build/
```

### GitHub Pages Deployment

The frontend is deployed to GitHub Pages at `https://ramtarun02.github.io/VFP-2025`.

1. Ensure `VITE_BASE_PATH=/VFP-2025` is set in `.env.production`
2. `npm run build` generates optimised assets in `build/`
3. Deploy `build/` to the `gh-pages` branch

In production, the frontend communicates with the backend at the Azure App Service URL (auto-detected in `client.ts` or set via `VITE_API_URL`).

---

## Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `VITE_API_URL` | (empty = use proxy in dev, auto-detect in prod) | Flask API base URL |
| `VITE_WS_URL` | `http://127.0.0.1:5000` | WebSocket server URL |
| `VITE_BASE_PATH` | `/` | Deployment sub-path (set to `/VFP-2025` for GitHub Pages) |

---

## Legacy Code & Migration Notes

The project is in **active migration** from JavaScript (`.jsx`/`.js`) to TypeScript (`.tsx`/`.ts`). The current state:

| Layer | Status |
| --- | --- |
| `types/` | ✅ Fully TypeScript |
| `api/` | ✅ Fully TypeScript (new layer) |
| `hooks/` | ✅ Fully TypeScript |
| `store/` | ✅ Fully TypeScript |
| `components/` | ⚠️ Mostly `.jsx`/`.js` — migration in progress |
| `utils/` | ⚠️ All `.js` — to be converted |

**Legacy files being replaced:**

- `utils/fetch.js` → `api/client.ts` (typed, error-normalised)
- `utils/socket.js` → `api/socket.ts` (typed events)
- `components/vfpDataContext.jsx` → `store/VfpDataContext.tsx`
- `components/SimulationDataContext.jsx` → `store/SimulationDataContext.tsx`

When working on components, prefer importing from the `api/` and `store/` TypeScript modules. The legacy `utils/fetch.js` and `utils/socket.js` should not be used in new code.

---

## Key Design Decisions

| Decision | Rationale |
| --- | --- |
| **React Context over Redux** | Small to medium state complexity; avoids external dependency; two contexts suffice for the current domain model |
| **Lazy-loaded routes** | Plotly.js and Three.js are large libraries; lazy loading keeps the initial bundle small |
| **Streaming JSON parsers** | VFP result files routinely exceed 100 MB; `JSON.parse()` would crash the browser; streaming + IndexedDB keeps memory bounded |
| **Separate IndexedDB stores** | Continuation-run dumps and post-processing results have different lifecycles; separate DBs avoid accidental data loss |
| **Polling-only in dev** | Werkzeug (Flask dev server) cannot upgrade HTTP to WebSocket; production uses eventlet with full WebSocket support |
| **Chunk splitting** | Plotly (~3 MB), Three.js, D3, and React are split into separate vendor chunks for better caching and parallel loading |
| **`allowJs: true`** | Enables incremental migration of `.jsx` components to `.tsx` without blocking development |
| **No component library** | Domain-specific visualisation (Plotly, Three.js, D3) doesn't benefit from generic UI kits; Tailwind provides sufficient styling |

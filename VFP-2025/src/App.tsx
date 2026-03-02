/**
 * App.tsx
 * =======
 * Root component.  Wraps the application in global context providers.
 */

import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { VfpDataProvider }        from './store/VfpDataContext';
import { SimulationDataProvider } from './components/SimulationDataContext';
import { ErrorBoundary }          from './components/ui/ErrorBoundary';

import './App.css';

// ── Lazy-loaded route components ───────────────────────────────────────────────

const LandingPage       = lazy(() => import('./components/LandingPage'));
const RunSolver         = lazy(() => import('./components/RunSolver'));
const GeometryModule    = lazy(() => import('./components/GeometryModule'));
const SimulationRun     = lazy(() => import('./components/SimulationRun'));
const PostProcessing    = lazy(() => import('./components/PostProcessing'));
const Research          = lazy(() => import('./components/Research'));
const ProWiM            = lazy(() => import('./components/ProWiM'));
const ContourPlot       = lazy(() => import('./components/ContourPlot'));
const BoundaryLayerData = lazy(() => import('./components/BoundaryLayerData'));

// ── Loading fallback ──────────────────────────────────────────────────────────

function PageLoader(): React.ReactElement {
  return (
    <div
      style={{
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'center',
        height:          '100vh',
        background:      '#0f172a',
        color:           '#94a3b8',
        fontFamily:      'system-ui, sans-serif',
        fontSize:        '1rem',
      }}
    >
      Loading…
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App(): React.ReactElement {
  const basePath = (import.meta.env.VITE_BASE_PATH as string) || '/';

  return (
    <ErrorBoundary>
      <VfpDataProvider>
        <SimulationDataProvider>
          <BrowserRouter basename={basePath}>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/"           element={<LandingPage />} />
                <Route path="/solver"     element={<RunSolver />} />
                <Route path="/geometry"   element={<GeometryModule />} />
                <Route path="/simulation" element={<SimulationRun />} />
                <Route path="/post"             element={<PostProcessing />} />
                <Route path="/post-processing" element={<PostProcessing />} />
                <Route path="/research"        element={<Research />} />
                <Route path="/prowim"     element={<ProWiM />} />
                <Route path="/post-processing/prowim"          element={<ProWiM />} />
                <Route path="/post-processing/contour-plot"    element={<ContourPlot />} />
                <Route path="/post-processing/boundary-layer"  element={<BoundaryLayerData />} />
                {/* Catch-all → home */}
                <Route path="*"           element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </SimulationDataProvider>
      </VfpDataProvider>
    </ErrorBoundary>
  );
}

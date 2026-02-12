import React from "react";
import { HashRouter as Router, Routes, Route } from "react-router-dom";
import LandingPage from "./components/LandingPage";
import GeometryModule from "./components/GeometryModule";
import RunSolver from "./components/runSolver";
import Solver from "./components/Solver"
import PostProcessing from "./components/PostProcessing";
import VFPPost from "./components/VFPPost"
import ProWiM from "./components/ProWiM"
import { VfpDataContext, VfpDataProvider } from "./components/vfpDataContext";

import SimulationRun from "./components/SimulationRun";
import BoundaryLayer from "./components/BoundaryLayerData";
import ContourPlot from "./components/ContourPlot";
import { SimulationDataProvider } from "./components/SimulationDataContext";
import Research from "./components/Research";


function App() {
  return (
    <VfpDataProvider>
      <SimulationDataProvider>
        <Router>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/geometry" element={<GeometryModule />} />
            <Route path="/run-solver" element={<RunSolver />} />
            <Route path="/results" element={<Solver />} />
            <Route path="/post-processing" element={<PostProcessing />} />
            <Route path="/vfppost" element={<VFPPost />} />
            <Route path="/post-processing/prowim" element={<ProWiM />} />
            <Route path="/post-processing/contour-plot" element={<ContourPlot />} />
            <Route path="/post-processing/boundary-layer" element={<BoundaryLayer />} />
            <Route path="/simulation-run" element={<SimulationRun />} />
            <Route path="/research" element={<Research />} />
          </Routes>
        </Router>
      </SimulationDataProvider>
    </VfpDataProvider>
  );
}

export default App;


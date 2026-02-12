import React, { createContext, useContext, useState } from "react";

const SimulationDataContext = createContext();

export function SimulationDataProvider({ children }) {
    const [simulationData, setSimulationData] = useState(null);
    const [selectedFiles, setSelectedFiles] = useState({
        dat: null,
        cp: null,
        forces: null
    });

    // Supplemental data passed between modules
    const [polars, setPolars] = useState(null);
    const [polarsSource, setPolarsSource] = useState(null);
    const [aeroCoefficients, setAeroCoefficients] = useState(null);

    // Configuration states
    const [selectedLevel, setSelectedLevel] = useState('');
    const [selectedSection, setSelectedSection] = useState('');
    const [selectedPlotType, setSelectedPlotType] = useState('Mach');
    const [selectedSpanwiseCoeff, setSelectedSpanwiseCoeff] = useState('CL');

    // Parsed data states
    const [parsedCpData, setParsedCpData] = useState(null);
    const [parsedDatData, setParsedDatData] = useState(null);
    const [parsedForcesData, setParsedForcesData] = useState(null);
    const [selectedTailFile, setSelectedTailFile] = useState(null);
    const [selectedtailGEOFile, setSelectedtailGEOFile] = useState(null);
    const [tailPlaneParams, setTailPlaneParams] = useState(null);

    return (
        <SimulationDataContext.Provider value={{
            simulationData,
            setSimulationData,
            selectedFiles,
            setSelectedFiles,
            polars,
            setPolars,
            polarsSource,
            setPolarsSource,
            aeroCoefficients,
            setAeroCoefficients,
            selectedLevel,
            setSelectedLevel,
            selectedSection,
            setSelectedSection,
            selectedPlotType,
            setSelectedPlotType,
            selectedSpanwiseCoeff,
            setSelectedSpanwiseCoeff,
            parsedCpData,
            setParsedCpData,
            parsedDatData,
            setParsedDatData,
            parsedForcesData,
            setParsedForcesData,
            selectedTailFile,
            setSelectedTailFile,
            selectedtailGEOFile,
            setSelectedtailGEOFile,
            tailPlaneParams,
            setTailPlaneParams
        }}>
            {children}
        </SimulationDataContext.Provider>
    );
}

export function useSimulationData() {
    return useContext(SimulationDataContext);
}


import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Plot from 'react-plotly.js';
import { fetchAPI } from '../utils/fetch';
import { useSimulationData } from "../components/SimulationDataContext";
import { getResultFileAsBlob } from '../utils/vfpPostParser';

function BoundaryLayer() {
    // --- Routing and Context ---
    const navigate = useNavigate();
    const location = useLocation();
    const { simulationData, importMode, vfpManifest, vfpFileName } = useSimulationData();

    // --- Local State ---
    const [visData, setVisData] = useState(null);
    const [sections, setSections] = useState([]);
    const [selectedSection, setSelectedSection] = useState('');
    const [selectedLevel, setSelectedLevel] = useState('level1');
    const [plotData, setPlotData] = useState({
        theta: null,
        delta: null,
        hbar: null,
        cf: null,
        beta: null,
        cp: null
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);


    // --- File Explorer Resize State ---
    const [explorerWidth, setExplorerWidth] = useState(320);
    const [isResizing, setIsResizing] = useState(false);
    const resizeRef = React.useRef(null);

    // --- Available .vis files from simulation folder ---
    const [availableVisFiles, setAvailableVisFiles] = useState([]);

    // --- VFP flow key selection ---
    const [selectedVfpFlowKey, setSelectedVfpFlowKey] = useState('');
    const [selectedVfpConfig, setSelectedVfpConfig] = useState('wingConfig');

    // Derive flow keys from VFP manifest
    const vfpWingFlowKeys = useMemo(() => {
        if (!vfpManifest?.wingConfig) return [];
        return Object.keys(vfpManifest.wingConfig).sort();
    }, [vfpManifest]);

    const vfpTailFlowKeys = useMemo(() => {
        if (!vfpManifest?.tailConfig) return [];
        return Object.keys(vfpManifest.tailConfig).sort();
    }, [vfpManifest]);

    // Derive .vis files available for the selected VFP flow key
    const vfpVisFiles = useMemo(() => {
        if (importMode !== 'vfp' || !vfpManifest || !selectedVfpFlowKey || !selectedVfpConfig) return [];
        const flowEntry = vfpManifest[selectedVfpConfig]?.[selectedVfpFlowKey];
        if (!flowEntry?.fileTypes?.vis) return [];
        return flowEntry.fileTypes.vis.map(name => ({ name, configKey: selectedVfpConfig, flowKey: selectedVfpFlowKey }));
    }, [importMode, vfpManifest, selectedVfpFlowKey, selectedVfpConfig]);

    // --- BL Velocity Profile states ---
    const [showBLProfile, setShowBLProfile] = useState(false);
    const [blInputs, setBLInputs] = useState({
        xc: 0.25,
        eta: 0.5
    });
    const [selectedSurface, setSelectedSurface] = useState('upper');
    const [blParameters, setBLParameters] = useState({
        theta: 'NaN',
        delta: 'NaN',
        hbar: 'NaN',
        cf: 'NaN',
        beta: 'NaN'
    });
    const [blPlots, setBLPlots] = useState({
        streamwise: null,
        crossflow: null
    });

    // --- Effect: Scan simulationData for .vis files on mount or change ---
    useEffect(() => {
        console.log('[DEBUG] Boundary Layer - simulationData:', simulationData);

        if (simulationData && simulationData.files) {
            const visFiles = [];
            // Check if files is an object with different file types
            if (typeof simulationData.files === 'object' && !Array.isArray(simulationData.files)) {
                Object.entries(simulationData.files).forEach(([fileType, fileList]) => {
                    if (Array.isArray(fileList)) {
                        fileList.forEach(file => {
                            if (file.name && file.name.toLowerCase().endsWith('.vis')) {
                                visFiles.push(file);
                            }
                        });
                    }
                });
            } else if (Array.isArray(simulationData.files)) {
                simulationData.files.forEach(file => {
                    if (file.name && file.name.toLowerCase().endsWith('.vis')) {
                        visFiles.push(file);
                    }
                });
            }
            console.log('[DEBUG] Found .vis files:', visFiles);
            setAvailableVisFiles(visFiles);
        }
    }, [simulationData]);

    // --- Mouse Handlers for Resize ---
    const handleMouseDown = React.useCallback((e) => {
        setIsResizing(true);
        e.preventDefault();
    }, []);

    const handleMouseMove = React.useCallback((e) => {
        if (!isResizing) return;
        const newWidth = e.clientX;
        if (newWidth >= 200 && newWidth <= 600) {
            setExplorerWidth(newWidth);
        }
    }, [isResizing]);

    const handleMouseUp = React.useCallback(() => {
        setIsResizing(false);
    }, []);

    useEffect(() => {
        if (isResizing) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        } else {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing, handleMouseMove, handleMouseUp]);



    // --- Handle selection of .vis file from VFP archive (IndexedDB) ---
    const handleSelectVisFromVfp = async (visFileInfo) => {
        setLoading(true);
        setError(null);
        try {
            const blob = await getResultFileAsBlob(visFileInfo.configKey, visFileInfo.flowKey, visFileInfo.name);
            if (!blob) {
                throw new Error(`File "${visFileInfo.name}" not found in local storage`);
            }
            await processVisFile(blob, true, visFileInfo.name);
        } catch (err) {
            setError(`Error loading VFP .vis file: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    // --- Handle file import from computer ---
    const handleImportVis = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.vis';
        input.onchange = async (event) => {
            const file = event.target.files[0];
            if (file) {
                await processVisFile(file, true); // true indicates local file
            }
        };
        input.click();
    };

    // --- Handle selection of .vis file from folder ---
    const handleSelectVisFromFolder = async (visFile) => {
        setLoading(true);
        setError(null);
        try {
            console.log('[DEBUG] Selected .vis file:', visFile);
            if (visFile.file) {
                if (!(visFile.file instanceof File)) {
                    setError('Selected file is not a valid File object.');
                    setLoading(false);
                    return;
                }
                console.log('[DEBUG] Processing local .vis file:', visFile.file.name, visFile.file);
                await processVisFile(visFile.file, true, visFile.name);
            } else {
                // Fetch file content from server for files in simulation folder
                const simName = simulationData?.simName || 'unknown';
                const response = await fetchAPI('/api/simulation/file-content', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        simName: simName,
                        filePath: visFile.path || visFile.name
                    })
                });
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
                }
                const content = await response.text();
                const blob = new Blob([content], { type: 'text/plain' });
                const fileObj = new File([blob], visFile.name, { type: 'text/plain' });
                await processVisFile(fileObj, false, visFile.name);
            }
        } catch (error) {
            setError(`Error loading .vis file: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    // --- Common function to process .vis files (both local and server) ---
    const processVisFile = async (file, isLocalFile = true, originalFileName = null) => {
        setLoading(true);
        setError(null);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const response = await fetchAPI('/api/post/parse-vis', {
                method: 'POST',
                body: formData
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            console.log('[DEBUG] VIS data received:', data);
            if (!isLocalFile && originalFileName) {
                data.fileName = originalFileName;
            }
            setVisData(data);
            // Update sections dropdown with level1 sections by default
            if (data.levels && data.levels.level1 && data.levels.level1.sections) {
                const sectionOptions = Object.keys(data.levels.level1.sections)
                    .map(sectionKey => ({
                        value: sectionKey,
                        label: `Section ${data.levels.level1.sections[sectionKey].spanJ2}`,
                        data: data.levels.level1.sections[sectionKey],
                        spanJ2: data.levels.level1.sections[sectionKey].spanJ2
                    }))
                    .sort((a, b) => a.spanJ2 - b.spanJ2);
                setSections(sectionOptions);
            }
        } catch (error) {
            console.error('[DEBUG] Error processing VIS file:', error);
            setError(`Error processing VIS file: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    // --- Update sections when level changes ---
    useEffect(() => {
        if (visData && visData.levels && visData.levels[selectedLevel]) {
            const levelSections = visData.levels[selectedLevel].sections;
            if (levelSections) {
                const sectionOptions = Object.keys(levelSections)
                    .map(sectionKey => ({
                        value: sectionKey,
                        label: `Section ${levelSections[sectionKey].spanJ2}`,
                        data: levelSections[sectionKey],
                        spanJ2: levelSections[sectionKey].spanJ2
                    }))
                    .sort((a, b) => a.spanJ2 - b.spanJ2);
                setSections(sectionOptions);
                setSelectedSection('');
                setPlotData({
                    theta: null,
                    delta: null,
                    hbar: null,
                    cf: null,
                    beta: null,
                    cp: null
                });
            }
        }
    }, [visData, selectedLevel]);

    // --- Generate plot when section changes (only when not in BL profile mode) ---
    useEffect(() => {
        if (visData && selectedLevel && selectedSection && !showBLProfile) {
            generateBoundaryLayerPlots();
        }
    }, [visData, selectedLevel, selectedSection, showBLProfile]);

    // --- Utility: Separate upper and lower surface data ---
    const separateSurfaceData = (xData, yData) => {
        if (!xData || !yData || xData.length === 0) {
            return { lower: { x: [], y: [] }, upper: { x: [], y: [] } };
        }
        const minXValue = Math.min(...xData);
        const leIndex = xData.findIndex(x => x === minXValue);
        const lowerSurface = {
            x: xData.slice(0, leIndex + 1),
            y: yData.slice(0, leIndex + 1)
        };
        const upperSurface = {
            x: xData.slice(leIndex),
            y: yData.slice(leIndex)
        };
        return { lower: lowerSurface, upper: upperSurface };
    };

    // --- Utility: Interpolation function (2D nearest neighbor) ---
    const interpolate2D = (X, ETA, values, targetX, targetEta) => {
        if (!X || !ETA || !values || X.length === 0) {
            return NaN;
        }
        let minDistance = Infinity;
        let nearestValue = NaN;
        for (let i = 0; i < X.length; i++) {
            for (let j = 0; j < X[i].length; j++) {
                const distance = Math.sqrt(
                    Math.pow(X[i][j] - targetX, 2) +
                    Math.pow(ETA[i] - targetEta, 2)
                );
                if (distance < minDistance) {
                    minDistance = distance;
                    nearestValue = values[i][j];
                }
            }
        }
        return nearestValue;
    };

    // --- Calculate BL velocity profile ---
    const calculateBLProfile = () => {
        if (!visData || !selectedLevel) {
            alert('Please load VIS data first');
            return;
        }
        const { xc, eta } = blInputs;
        // Create 2D mesh matrices from all sections
        const X = [];
        const ETA = [];
        const thetaMatrix = [];
        const deltaMatrix = [];
        const hMatrix = [];
        const cfMatrix = [];
        const betaMatrix = [];
        const levelData = visData.levels[selectedLevel];
        const sectionKeys = Object.keys(levelData.sections);
        sectionKeys.forEach((sectionKey, i) => {
            const section = levelData.sections[sectionKey];
            let startIdx, endIdx;
            if (selectedSurface === 'upper') {
                startIdx = Math.floor(section['x/c'].length * 0.55);
                endIdx = section['x/c'].length - 1;
            } else {
                startIdx = Math.floor(section['x/c'].length * 0.1);
                endIdx = Math.floor(section['x/c'].length * 0.55);
            }
            X.push(section['x/c'].slice(startIdx, endIdx + 1));
            thetaMatrix.push(section['Theta/c'].slice(startIdx, endIdx + 1));
            deltaMatrix.push(section['Dis/c'].slice(startIdx, endIdx + 1));
            hMatrix.push(section['H'].slice(startIdx, endIdx + 1));
            cfMatrix.push(section['Cf'].slice(startIdx, endIdx + 1));
            betaMatrix.push(section['Beta'].slice(startIdx, endIdx + 1));
            ETA.push(section.eta || i * 0.1);
        });
        // Interpolate values at the specified x/c and eta
        const theta = interpolate2D(X, ETA, thetaMatrix, xc, eta);
        const delta = interpolate2D(X, ETA, deltaMatrix, xc, eta);
        const H = interpolate2D(X, ETA, hMatrix, xc, eta);
        const cf = interpolate2D(X, ETA, cfMatrix, xc, eta);
        const beta = interpolate2D(X, ETA, betaMatrix, xc, eta);
        setBLParameters({
            theta: isNaN(theta) ? 'NaN' : theta.toExponential(4),
            delta: isNaN(delta) ? 'NaN' : delta.toExponential(4),
            hbar: isNaN(H) ? 'NaN' : H.toFixed(4),
            cf: isNaN(cf) ? 'NaN' : cf.toExponential(4),
            beta: isNaN(beta) ? 'NaN' : beta.toFixed(4)
        });
        if (isNaN(theta) || isNaN(H) || isNaN(cf) || isNaN(beta)) {
            alert('Could not interpolate values at the specified location');
            return;
        }
        // Calculate velocity profiles
        const n = 2 / (H - 1);
        const a_coeff = 1.522 * Math.sqrt(cf / 2);
        const b_coeff = 8.0605 * Math.sqrt(cf / 2) - (H - 1) / H;
        const c_coeff = 12.6896 * Math.sqrt(cf / 2) - 2.5189 * (H - 1) / H;
        const discriminant = b_coeff * b_coeff - 4 * a_coeff * c_coeff;
        const Px = discriminant >= 0 ?
            (-b_coeff + Math.sqrt(discriminant)) / (2 * a_coeff) : 0;
        const y_delta = [];
        for (let i = 0; i <= 120; i++) {
            y_delta.push(i * 0.01);
        }
        const u_power = y_delta.map(y =>
            y <= 1 ? Math.pow(y, 1 / n) : 1
        );
        const u_Coles = y_delta.map(y => {
            if (y <= 0.001) return 0;
            return 1 + Math.sqrt(cf / 2) * (5.8 * Math.log10(y) - (1 + Math.cos(Math.PI * y)) * Px);
        });
        const w_profile = y_delta.map(y =>
            y < 1 ? u_Coles[y_delta.indexOf(y)] * Math.pow(1 - y, 2) * Math.tan(beta * Math.PI / 180) : 0
        );
        // Create streamwise velocity plot
        const streamwisePlot = {
            data: [{
                x: u_power,
                y: y_delta,
                type: 'scatter',
                mode: 'lines',
                name: 'Streamwise Velocity',
                line: { color: '#1f77b4', width: 2 }
            }],
            layout: {
                title: { text: 'Streamwise Direction', font: { size: 16, family: 'Arial, sans-serif' } },
                xaxis: { title: { text: 'u/Ue', font: { size: 14 } }, range: [0, 1.2], showgrid: true, gridcolor: '#e8e8e8' },
                yaxis: { title: { text: 'y/δ', font: { size: 14 } }, range: [0, 1.2], showgrid: true, gridcolor: '#e8e8e8' },
                showlegend: false,
                margin: { l: 60, r: 40, t: 60, b: 60 },
                plot_bgcolor: 'white',
                paper_bgcolor: 'white'
            },
            config: { displayModeBar: true, displaylogo: false, responsive: true }
        };
        // Create crossflow velocity plot
        const crossflowPlot = {
            data: [{
                x: w_profile,
                y: y_delta,
                type: 'scatter',
                mode: 'lines',
                name: 'Crossflow Velocity',
                line: { color: '#1f77b4', width: 2 }
            }],
            layout: {
                title: { text: 'Crossflow Direction', font: { size: 16, family: 'Arial, sans-serif' } },
                xaxis: { title: { text: 'w/Ue', font: { size: 14 } }, showgrid: true, gridcolor: '#e8e8e8' },
                yaxis: { title: { text: 'y/δ', font: { size: 14 } }, range: [0, 1.2], showgrid: true, gridcolor: '#e8e8e8' },
                showlegend: false,
                margin: { l: 60, r: 40, t: 60, b: 60 },
                plot_bgcolor: 'white',
                paper_bgcolor: 'white'
            },
            config: { displayModeBar: true, displaylogo: false, responsive: true }
        };
        setBLPlots({
            streamwise: streamwisePlot,
            crossflow: crossflowPlot
        });
    };

    // --- Generate boundary layer plots for selected section ---
    const generateBoundaryLayerPlots = () => {
        if (!visData || !selectedLevel || !selectedSection) return;
        const sectionData = visData.levels[selectedLevel].sections[selectedSection];
        if (!sectionData) return;
        // Common plot configuration
        const commonConfig = {
            displayModeBar: true,
            displaylogo: false,
            modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d'],
            responsive: true
        };
        const commonLayoutProps = {
            showlegend: true,
            legend: { x: 0.02, y: 0.98, bgcolor: 'rgba(255,255,255,0.8)', bordercolor: '#ddd', borderwidth: 1 },
            margin: { l: 80, r: 50, t: 80, b: 70 },
            plot_bgcolor: 'white',
            paper_bgcolor: 'white',
            xaxis: { title: { text: 'x/c', font: { size: 14, family: 'Arial, sans-serif' } }, showgrid: true, gridcolor: '#e8e8e8', range: [0, 1.00], fixedrange: false, tickfont: { size: 12, family: 'Arial, sans-serif' } },
            yaxis: { showgrid: true, gridcolor: '#e8e8e8', tickfont: { size: 12, family: 'Arial, sans-serif' } },
            autosize: true
        };
        // 1. Theta/c (Momentum Thickness) Plot
        const thetaSurfaces = separateSurfaceData(sectionData['x/c'], sectionData['Theta/c']);
        const thetaPlot = {
            data: [
                {
                    x: thetaSurfaces.lower.x,
                    y: thetaSurfaces.lower.y,
                    type: 'scatter',
                    mode: 'lines+markers',
                    name: 'Lower Surface',
                    line: { color: '#1f77b4', width: 2 },
                    marker: { size: 4, color: '#1f77b4' }
                },
                {
                    x: thetaSurfaces.upper.x,
                    y: thetaSurfaces.upper.y,
                    type: 'scatter',
                    mode: 'lines+markers',
                    name: 'Upper Surface',
                    line: { color: '#d62728', width: 2 },
                    marker: { size: 4, color: '#d62728' }
                }
            ],
            layout: {
                ...commonLayoutProps,
                title: { text: `Momentum Thickness (θ/c)`, font: { size: 16, family: 'Arial, sans-serif' }, x: 0.5, xanchor: 'center' },
                yaxis: { ...commonLayoutProps.yaxis, title: { text: 'θ/c', font: { size: 14, family: 'Arial, sans-serif' } } }
            },
            config: commonConfig
        };
        // 2. Dis/c (Displacement Thickness) Plot
        const deltaSurfaces = separateSurfaceData(sectionData['x/c'], sectionData['Dis/c']);
        const deltaPlot = {
            data: [
                {
                    x: deltaSurfaces.lower.x,
                    y: deltaSurfaces.lower.y,
                    type: 'scatter',
                    mode: 'lines+markers',
                    name: 'Lower Surface',
                    line: { color: '#1f77b4', width: 2 },
                    marker: { size: 4, color: '#1f77b4' }
                },
                {
                    x: deltaSurfaces.upper.x,
                    y: deltaSurfaces.upper.y,
                    type: 'scatter',
                    mode: 'lines+markers',
                    name: 'Upper Surface',
                    line: { color: '#d62728', width: 2 },
                    marker: { size: 4, color: '#d62728' }
                }
            ],
            layout: {
                ...commonLayoutProps,
                title: { text: `Displacement Thickness (δ*/c)`, font: { size: 16, family: 'Arial, sans-serif' }, x: 0.5, xanchor: 'center' },
                yaxis: { ...commonLayoutProps.yaxis, title: { text: 'δ*/c', font: { size: 14, family: 'Arial, sans-serif' } } }
            },
            config: commonConfig
        };
        // 3. H (Shape Factor) Plot
        const hSurfaces = separateSurfaceData(sectionData['x/c'], sectionData['H']);
        const hbarPlot = {
            data: [
                {
                    x: hSurfaces.lower.x,
                    y: hSurfaces.lower.y,
                    type: 'scatter',
                    mode: 'lines+markers',
                    name: 'Lower Surface',
                    line: { color: '#1f77b4', width: 2 },
                    marker: { size: 4, color: '#1f77b4' }
                },
                {
                    x: hSurfaces.upper.x,
                    y: hSurfaces.upper.y,
                    type: 'scatter',
                    mode: 'lines+markers',
                    name: 'Upper Surface',
                    line: { color: '#d62728', width: 2 },
                    marker: { size: 4, color: '#d62728' }
                }
            ],
            layout: {
                ...commonLayoutProps,
                title: { text: `Shape Factor (H)`, font: { size: 16, family: 'Arial, sans-serif' }, x: 0.5, xanchor: 'center' },
                yaxis: { ...commonLayoutProps.yaxis, title: { text: 'H', font: { size: 14, family: 'Arial, sans-serif' } } }
            },
            config: commonConfig
        };
        // 4. Cf (Skin Friction Coefficient) Plot
        const cfSurfaces = separateSurfaceData(sectionData['x/c'], sectionData['Cf']);
        const cfPlot = {
            data: [
                {
                    x: cfSurfaces.lower.x,
                    y: cfSurfaces.lower.y,
                    type: 'scatter',
                    mode: 'lines+markers',
                    name: 'Lower Surface',
                    line: { color: '#1f77b4', width: 2 },
                    marker: { size: 4, color: '#1f77b4' }
                },
                {
                    x: cfSurfaces.upper.x,
                    y: cfSurfaces.upper.y,
                    type: 'scatter',
                    mode: 'lines+markers',
                    name: 'Upper Surface',
                    line: { color: '#d62728', width: 2 },
                    marker: { size: 4, color: '#d62728' }
                }
            ],
            layout: {
                ...commonLayoutProps,
                title: { text: `Skin Friction Coefficient (Cf)`, font: { size: 16, family: 'Arial, sans-serif' }, x: 0.5, xanchor: 'center' },
                yaxis: { ...commonLayoutProps.yaxis, title: { text: 'Cf', font: { size: 14, family: 'Arial, sans-serif' } } }
            },
            config: commonConfig
        };
        // 5. Beta Plot
        const betaSurfaces = separateSurfaceData(sectionData['x/c'], sectionData['Beta']);
        const betaPlot = {
            data: [
                {
                    x: betaSurfaces.lower.x,
                    y: betaSurfaces.lower.y,
                    type: 'scatter',
                    mode: 'lines+markers',
                    name: 'Lower Surface',
                    line: { color: '#1f77b4', width: 2 },
                    marker: { size: 4, color: '#1f77b4' }
                },
                {
                    x: betaSurfaces.upper.x,
                    y: betaSurfaces.upper.y,
                    type: 'scatter',
                    mode: 'lines+markers',
                    name: 'Upper Surface',
                    line: { color: '#d62728', width: 2 },
                    marker: { size: 4, color: '#d62728' }
                }
            ],
            layout: {
                ...commonLayoutProps,
                title: { text: `Beta (β)`, font: { size: 16, family: 'Arial, sans-serif' }, x: 0.5, xanchor: 'center' },
                yaxis: { ...commonLayoutProps.yaxis, title: { text: 'Beta', font: { size: 14, family: 'Arial, sans-serif' } } }
            },
            config: commonConfig
        };
        // 6. Cp Plot
        const CpSurfaces = separateSurfaceData(sectionData['x/c'], sectionData['Cp']);
        const CpPlot = {
            data: [
                {
                    x: CpSurfaces.lower.x,
                    y: CpSurfaces.lower.y,
                    type: 'scatter',
                    mode: 'lines+markers',
                    name: 'Lower Surface',
                    line: { color: '#1f77b4', width: 2 },
                    marker: { size: 4, color: '#1f77b4' }
                },
                {
                    x: CpSurfaces.upper.x,
                    y: CpSurfaces.upper.y,
                    type: 'scatter',
                    mode: 'lines+markers',
                    name: 'Upper Surface',
                    line: { color: '#d62728', width: 2 },
                    marker: { size: 4, color: '#d62728' }
                }
            ],
            layout: {
                ...commonLayoutProps,
                title: { text: `Pressure Coefficient (Cp)`, font: { size: 16, family: 'Arial, sans-serif' }, x: 0.5, xanchor: 'center' },
                yaxis: { ...commonLayoutProps.yaxis, title: { text: 'Cp', font: { size: 14, family: 'Arial, sans-serif' } }, autorange: 'reversed' }
            },
            config: commonConfig
        };
        setPlotData({
            theta: thetaPlot,
            delta: deltaPlot,
            hbar: hbarPlot,
            cf: cfPlot,
            beta: betaPlot,
            cp: CpPlot
        });
    };

    // --- Utility: Get levels for dropdown ---
    const getLevels = () => {
        if (!visData || !visData.levels) return [];
        return Object.keys(visData.levels).map(levelKey => ({
            value: levelKey,
            label: levelKey.charAt(0).toUpperCase() + levelKey.slice(1)
        }));
    };



    return (
        <div className="flex flex-col h-screen bg-blue-50 font-sans">
            {/* Header */}
            <div className="flex items-center justify-between px-4 sm:px-6 lg:px-8 py-4 bg-white border-b border-blue-200 shadow-sm">
                <div className="flex items-center">
                    <h1 className="text-lg sm:text-xl lg:text-2xl font-semibold text-gray-800">Boundary Layer Data Visualization</h1>
                </div>
                <div className="flex items-center space-x-2 sm:space-x-3">
                    <button
                        onClick={handleImportVis}
                        className="px-3 sm:px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm sm:text-base transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    >
                        <span className="hidden sm:inline">Import .vis File</span>
                        <span className="sm:hidden">Import</span>
                    </button>
                    <button
                        onClick={() => navigate('/post-processing')}
                        className="px-3 sm:px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium text-sm sm:text-base transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2"
                    >
                        <span className="hidden sm:inline">Back to Post-Processing</span>
                        <span className="sm:hidden">Back</span>
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex flex-1 overflow-hidden">
                {/* Controls Sidebar */}
                <div
                    className="bg-white border-r border-blue-200 p-3 lg:p-4 overflow-y-auto flex-shrink-0 relative transition-all duration-300"
                    style={{ width: `${explorerWidth}px`, minWidth: '200px', maxWidth: '600px' }}
                >
                    {/* Drag handle for resizing */}
                    <div
                        ref={resizeRef}
                        className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-400 transition-colors duration-200 ${isResizing ? 'bg-blue-400' : 'bg-blue-200'}`}
                        onMouseDown={handleMouseDown}
                        style={{ zIndex: 10 }}
                    />

                    {/* ── VFP Mode: Flow Key + .vis file selection ── */}
                    {importMode === 'vfp' && vfpManifest && (
                        <div className="mb-4 lg:mb-6">
                            <h3 className="text-base lg:text-lg font-semibold text-gray-800 mb-2 lg:mb-3 pb-2 border-b-2 border-green-400">
                                VFP Source
                            </h3>
                            <p className="text-xs text-green-600 mb-2">🔒 {vfpFileName || '.vfp file'}</p>
                            {/* Config selector */}
                            {vfpTailFlowKeys.length > 0 && (
                                <div className="mb-2">
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Config</label>
                                    <select
                                        className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm"
                                        value={selectedVfpConfig}
                                        onChange={e => { setSelectedVfpConfig(e.target.value); setSelectedVfpFlowKey(''); }}
                                    >
                                        <option value="wingConfig">Wing</option>
                                        <option value="tailConfig">Tail</option>
                                    </select>
                                </div>
                            )}
                            {/* Flow key dropdown */}
                            <div className="mb-2">
                                <label className="block text-xs font-medium text-gray-700 mb-1">Flow Key</label>
                                <select
                                    className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm"
                                    value={selectedVfpFlowKey}
                                    onChange={e => setSelectedVfpFlowKey(e.target.value)}
                                >
                                    <option value="">Select Flow Key</option>
                                    {(selectedVfpConfig === 'tailConfig' ? vfpTailFlowKeys : vfpWingFlowKeys).map(k => (
                                        <option key={k} value={k}>{k}</option>
                                    ))}
                                </select>
                            </div>
                            {/* .vis files for selected flow key */}
                            {vfpVisFiles.length > 0 && (
                                <div className="mt-2">
                                    <label className="block text-xs font-medium text-gray-700 mb-1">.vis Files</label>
                                    <div className="flex flex-col gap-1 max-h-32 overflow-y-auto border border-blue-200 rounded-lg p-2 bg-blue-50">
                                        {vfpVisFiles.map((vf, idx) => (
                                            <div
                                                key={idx}
                                                className={`flex items-center p-2 bg-white border border-blue-200 rounded-lg cursor-pointer transition-all duration-200 hover:bg-blue-50 hover:border-blue-400 hover:shadow-sm ${visData && visData.fileName === vf.name ? 'ring-2 ring-green-500 border-green-500' : ''}`}
                                                onClick={() => handleSelectVisFromVfp(vf)}
                                                title={`Click to load ${vf.name}`}
                                            >
                                                <span className="text-sm mr-2">📊</span>
                                                <span className="flex-1 text-xs font-medium text-gray-800 truncate">{vf.name}</span>
                                                {visData && visData.fileName === vf.name && (
                                                    <span className="text-green-600 font-bold text-sm">✓</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {selectedVfpFlowKey && vfpVisFiles.length === 0 && (
                                <p className="text-xs text-gray-500 italic mt-1">No .vis files found for this flow key</p>
                            )}
                        </div>
                    )}

                    {/* Available .vis Files Section (folder mode) */}
                    {importMode !== 'vfp' && availableVisFiles.length > 0 && (
                        <div className="mb-4 lg:mb-6">
                            <h3 className="text-base lg:text-lg font-semibold text-gray-800 mb-2 lg:mb-3 pb-2 border-b-2 border-blue-400">
                                Available .vis Files
                            </h3>
                            <div className="flex flex-col gap-2 max-h-32 lg:max-h-48 overflow-y-auto border border-blue-200 rounded-lg p-2 bg-blue-50">
                                {availableVisFiles.map((visFile, index) => (
                                    <div
                                        key={index}
                                        className={`flex items-center p-2 lg:p-3 bg-white border border-blue-200 rounded-lg cursor-pointer transition-all duration-200 hover:bg-blue-50 hover:border-blue-400 hover:shadow-sm ${visData && visData.fileName === visFile.name ? 'ring-2 ring-blue-500 border-blue-500' : ''}`}
                                        onClick={() => handleSelectVisFromFolder(visFile)}
                                        title={`Click to load ${visFile.name}`}
                                    >
                                        <span className="text-sm lg:text-lg mr-2 lg:mr-3">📊</span>
                                        <span className="flex-1 text-xs lg:text-sm font-medium text-gray-800 truncate">{visFile.name}</span>
                                        {visData && visData.fileName === visFile.name && (
                                            <span className="text-blue-600 font-bold text-sm">✓</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}



                    <div className="mb-4 lg:mb-6">
                        <h3 className="text-base lg:text-lg font-semibold text-gray-800 mb-2 lg:mb-3 pb-2 border-b-2 border-blue-400">
                            File Information
                        </h3>
                        {visData ? (
                            <div className="bg-blue-50 p-3 lg:p-4 rounded-lg border-l-4 border-blue-400 break-words">
                                <div className="flex flex-col space-y-1">
                                    <p className="mb-2 text-sm break-words">
                                        <span className="font-semibold text-gray-700">File:</span>
                                        <span className="text-gray-900 ml-1 break-all">{visData.fileName}</span>
                                    </p>
                                    <p className="mb-2 text-sm">
                                        <span className="font-semibold text-gray-700">Levels Available:</span>
                                        <span className="text-gray-900 ml-1">{Object.keys(visData.levels || {}).length}</span>
                                    </p>
                                    {visData.levels[selectedLevel] && (
                                        <>
                                            <p className="mb-2 text-sm">
                                                <span className="font-semibold text-gray-700">Mach Number:</span>
                                                <span className="text-gray-900 ml-1">{visData.levels[selectedLevel].machNumber}</span>
                                            </p>
                                            <p className="mb-2 text-sm">
                                                <span className="font-semibold text-gray-700">Reynolds Number:</span>
                                                <span className="text-gray-900 ml-1">{visData.levels[selectedLevel].reynoldsNumber}</span>
                                            </p>
                                            <p className="text-sm">
                                                <span className="font-semibold text-gray-700">Angle of Attack:</span>
                                                <span className="text-gray-900 ml-1">{visData.levels[selectedLevel].incidence}°</span>
                                            </p>
                                        </>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="text-gray-600">
                                <p className="mb-2 text-sm">No .vis file loaded</p>
                                {availableVisFiles.length > 0 ? (
                                    <p className="text-xs italic text-gray-500">Select a .vis file from above or import a new one</p>
                                ) : (
                                    <p className="text-xs italic text-gray-500">Import a .vis file to get started</p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* BL Velocity Profile Toggle */}
                    <div className="mb-4 lg:mb-6">
                        <h3 className="text-base lg:text-lg font-semibold text-gray-800 mb-2 lg:mb-3 pb-2 border-b-2 border-blue-400">
                            View Mode
                        </h3>
                        <div className="flex items-center">
                            <label className="flex items-center cursor-pointer">
                                <div className="relative">
                                    <input
                                        type="checkbox"
                                        checked={showBLProfile}
                                        onChange={(e) => setShowBLProfile(e.target.checked)}
                                        className="sr-only"
                                    />
                                    <div className={`w-10 lg:w-12 h-5 lg:h-6 rounded-full transition-colors duration-200 ${showBLProfile ? 'bg-blue-500' : 'bg-gray-300'
                                        }`}></div>
                                    <div className={`absolute top-0.5 left-0.5 w-4 lg:w-5 h-4 lg:h-5 bg-white rounded-full transition-transform duration-200 ${showBLProfile ? 'transform translate-x-5 lg:translate-x-6' : ''
                                        }`}></div>
                                </div>
                                <span className="ml-2 lg:ml-3 font-medium text-gray-800 text-sm lg:text-base">BL Velocity Profile</span>
                            </label>
                        </div>
                    </div>

                    {visData && !showBLProfile && (
                        <>
                            <div className="mb-4 lg:mb-6">
                                <h3 className="text-base lg:text-lg font-semibold text-gray-800 mb-2 lg:mb-3 pb-2 border-b-2 border-blue-400">
                                    Level Selection
                                </h3>
                                <select
                                    className="w-full px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 text-sm lg:text-base transition-colors duration-200"
                                    value={selectedLevel}
                                    onChange={(e) => setSelectedLevel(e.target.value)}
                                >
                                    {getLevels().map(level => (
                                        <option key={level.value} value={level.value}>
                                            {level.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="mb-4 lg:mb-6">
                                <h3 className="text-base lg:text-lg font-semibold text-gray-800 mb-2 lg:mb-3 pb-2 border-b-2 border-blue-400">
                                    Section Selection
                                </h3>
                                <select
                                    className="w-full px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 text-sm lg:text-base transition-colors duration-200"
                                    value={selectedSection}
                                    onChange={(e) => setSelectedSection(e.target.value)}
                                >
                                    <option value="">Select Section</option>
                                    {sections.map(section => (
                                        <option key={section.value} value={section.value}>
                                            {section.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {selectedSection && visData.levels[selectedLevel]?.sections[selectedSection] && (
                                <div className="mb-4 lg:mb-6">
                                    <h3 className="text-base lg:text-lg font-semibold text-gray-800 mb-2 lg:mb-3 pb-2 border-b-2 border-blue-400">
                                        Section Details
                                    </h3>
                                    <div className="bg-green-50 p-3 lg:p-4 rounded-lg border-l-4 border-green-400">
                                        <p className="mb-2 text-sm"><span className="font-semibold text-gray-700">Span:</span> <span className="text-gray-900">j-2 = {visData.levels[selectedLevel].sections[selectedSection].spanJ2}</span></p>
                                        <p className="mb-2 text-sm"><span className="font-semibold text-gray-700">Eta:</span> <span className="text-gray-900">{visData.levels[selectedLevel].sections[selectedSection].eta?.toFixed(5)}</span></p>
                                        <p className="text-sm"><span className="font-semibold text-gray-700">Chord:</span> <span className="text-gray-900">{visData.levels[selectedLevel].sections[selectedSection].chord?.toFixed(5)}</span></p>
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* BL Velocity Profile Controls */}
                    {visData && showBLProfile && (
                        <>
                            <div className="mb-4 lg:mb-6">
                                <h3 className="text-base lg:text-lg font-semibold text-gray-800 mb-2 lg:mb-3 pb-2 border-b-2 border-blue-400">
                                    Input Parameters
                                </h3>
                                <div className="space-y-3 lg:space-y-4 mb-3 lg:mb-4">
                                    <div className="flex items-center space-x-3">
                                        <label className="font-semibold text-gray-700 w-10 lg:w-12 text-sm lg:text-base">X/C:</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            max="1"
                                            value={blInputs.xc}
                                            onChange={(e) => setBLInputs(prev => ({
                                                ...prev,
                                                xc: parseFloat(e.target.value)
                                            }))}
                                            className="flex-1 px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 text-sm lg:text-base"
                                        />
                                    </div>
                                    <div className="flex items-center space-x-3">
                                        <label className="font-semibold text-gray-700 w-10 lg:w-12 text-sm lg:text-base">η:</label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            value={blInputs.eta}
                                            onChange={(e) => setBLInputs(prev => ({
                                                ...prev,
                                                eta: parseFloat(e.target.value)
                                            }))}
                                            className="flex-1 px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 text-sm lg:text-base"
                                        />
                                    </div>
                                </div>
                                <button
                                    onClick={calculateBLProfile}
                                    className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-sm lg:text-base transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                                >
                                    Calculate
                                </button>
                            </div>

                            <div className="mb-4 lg:mb-6">
                                <h3 className="text-base lg:text-lg font-semibold text-gray-800 mb-2 lg:mb-3 pb-2 border-b-2 border-blue-400">
                                    Surface Selection
                                </h3>
                                <div className="space-y-2">
                                    <label className="flex items-center p-2 lg:p-3 border border-blue-200 rounded-lg cursor-pointer hover:bg-blue-50 transition-colors duration-200">
                                        <input
                                            type="radio"
                                            name="surface"
                                            value="upper"
                                            checked={selectedSurface === 'upper'}
                                            onChange={(e) => setSelectedSurface(e.target.value)}
                                            className="mr-2 lg:mr-3 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className={`font-medium text-sm lg:text-base ${selectedSurface === 'upper' ? 'text-blue-600' : 'text-gray-700'}`}>Upper Surface</span>
                                    </label>
                                    <label className="flex items-center p-2 lg:p-3 border border-blue-200 rounded-lg cursor-pointer hover:bg-blue-50 transition-colors duration-200">
                                        <input
                                            type="radio"
                                            name="surface"
                                            value="lower"
                                            checked={selectedSurface === 'lower'}
                                            onChange={(e) => setSelectedSurface(e.target.value)}
                                            className="mr-2 lg:mr-3 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className={`font-medium text-sm lg:text-base ${selectedSurface === 'lower' ? 'text-blue-600' : 'text-gray-700'}`}>Lower Surface</span>
                                    </label>
                                </div>
                            </div>

                            <div className="mb-4 lg:mb-6">
                                <h3 className="text-base lg:text-lg font-semibold text-gray-800 mb-2 lg:mb-3 pb-2 border-b-2 border-blue-400">
                                    Parameters
                                </h3>
                                <div className="bg-gray-800 rounded-lg p-3 lg:p-4 text-white">
                                    <div className="flex justify-between items-center py-2 border-b border-gray-600">
                                        <span className="font-semibold text-gray-200 text-sm lg:text-base">θ</span>
                                        <span className="font-mono bg-gray-700 px-2 py-1 rounded text-xs lg:text-sm text-gray-200">{blParameters.theta}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-2 border-b border-gray-600">
                                        <span className="font-semibold text-gray-200 text-sm lg:text-base">δ*</span>
                                        <span className="font-mono bg-gray-700 px-2 py-1 rounded text-xs lg:text-sm text-gray-200">{blParameters.delta}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-2 border-b border-gray-600">
                                        <span className="font-semibold text-gray-200 text-sm lg:text-base">H bar</span>
                                        <span className="font-mono bg-gray-700 px-2 py-1 rounded text-xs lg:text-sm text-gray-200">{blParameters.hbar}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-2 border-b border-gray-600">
                                        <span className="font-semibold text-gray-200 text-sm lg:text-base">Cf</span>
                                        <span className="font-mono bg-gray-700 px-2 py-1 rounded text-xs lg:text-sm text-gray-200">{blParameters.cf}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-2">
                                        <span className="font-semibold text-gray-200 text-sm lg:text-base">β</span>
                                        <span className="font-mono bg-gray-700 px-2 py-1 rounded text-xs lg:text-sm text-gray-200">{blParameters.beta}</span>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Plot Area */}
                <div className="flex-1 flex flex-col p-2 lg:p-4 bg-white overflow-hidden">
                    {loading && (
                        <div className="flex-1 flex justify-center items-center">
                            <div className="text-center">
                                <div className="animate-spin rounded-full h-10 lg:h-12 w-10 lg:w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                                <p className="text-lg lg:text-xl text-blue-600 font-medium">Loading VIS file...</p>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="flex-1 flex justify-center items-center">
                            <div className="text-center">
                                <div className="text-red-500 mb-4">
                                    <svg className="w-12 lg:w-16 h-12 lg:h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <p className="text-red-600 text-base lg:text-lg font-medium">{error}</p>
                            </div>
                        </div>
                    )}

                    {!visData && !loading && !error && (
                        <div className="flex-1 flex flex-col justify-center items-center text-center">
                            <div className="text-blue-400 mb-4 lg:mb-6">
                                <svg className="w-16 lg:w-24 h-16 lg:h-24 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                </svg>
                            </div>
                            <h2 className="text-xl lg:text-3xl font-semibold text-gray-800 mb-3 lg:mb-4">Welcome to Boundary Layer Data Visualization</h2>
                            {importMode === 'vfp' ? (
                                <p className="text-gray-600 text-sm lg:text-lg mb-4 lg:mb-6">Select a flow key and .vis file from the sidebar to get started</p>
                            ) : availableVisFiles.length > 0 ? (
                                <div>
                                    <p className="text-gray-600 text-sm lg:text-lg mb-4 lg:mb-6">Select a .vis file from the available files above, or import a new one</p>
                                    <button
                                        onClick={handleImportVis}
                                        className="px-6 lg:px-8 py-3 lg:py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-base lg:text-lg transition-all duration-200 shadow-lg hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                                    >
                                        Import New .vis File
                                    </button>
                                </div>
                            ) : (
                                <div>
                                    <p className="text-gray-600 text-sm lg:text-lg mb-4 lg:mb-6">Import a .vis file to get started</p>
                                    <button
                                        onClick={handleImportVis}
                                        className="px-6 lg:px-8 py-3 lg:py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-base lg:text-lg transition-all duration-200 shadow-lg hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                                    >
                                        Import .vis File
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Default 6-plot view - Responsive Grid */}
                    {visData && !showBLProfile && plotData.theta && (
                        <div className="flex-1 overflow-auto">
                            <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-3 lg:gap-4 p-2 lg:p-4 min-h-full">
                                {Object.entries(plotData).map(([key, data]) => (
                                    data && (
                                        <div key={key} className="w-full h-96 lg:h-[500px] xl:h-96 2xl:h-[400px] border border-blue-200 rounded-xl overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow duration-200 flex-shrink-0">
                                            <Plot
                                                data={data.data}
                                                layout={data.layout}
                                                config={data.config}
                                                style={{ width: '100%', height: '100%' }}
                                                useResizeHandler={true}
                                            />
                                        </div>
                                    )
                                ))}
                            </div>
                        </div>
                    )}

                    {/* BL Velocity Profile view - Responsive */}
                    {visData && showBLProfile && (
                        <div className="flex flex-col h-full overflow-auto">
                            <div className="text-center mb-4 lg:mb-6 px-4">
                                <h2 className="text-xl lg:text-3xl font-semibold text-blue-600">Boundary Layer Velocity Profile</h2>
                            </div>
                            <div className="flex-1 px-2 lg:px-4 pb-4">
                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 lg:gap-6 h-full">
                                    <div className="h-96 lg:h-[500px] xl:h-full border border-blue-200 rounded-xl overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow duration-200 flex items-center justify-center flex-shrink-0">
                                        {blPlots.streamwise ? (
                                            <Plot
                                                data={blPlots.streamwise.data}
                                                layout={blPlots.streamwise.layout}
                                                config={blPlots.streamwise.config}
                                                style={{ width: '100%', height: '100%' }}
                                                useResizeHandler={true}
                                            />
                                        ) : (
                                            <div className="text-center p-6 lg:p-8">
                                                <div className="text-blue-400 mb-4">
                                                    <svg className="w-12 lg:w-16 h-12 lg:h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                                    </svg>
                                                </div>
                                                <p className="text-gray-600 italic text-sm lg:text-base">Click Calculate to generate streamwise velocity profile</p>
                                            </div>
                                        )}
                                    </div>
                                    <div className="h-96 lg:h-[500px] xl:h-full border border-blue-200 rounded-xl overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow duration-200 flex items-center justify-center flex-shrink-0">
                                        {blPlots.crossflow ? (
                                            <Plot
                                                data={blPlots.crossflow.data}
                                                layout={blPlots.crossflow.layout}
                                                config={blPlots.crossflow.config}
                                                style={{ width: '100%', height: '100%' }}
                                                useResizeHandler={true}
                                            />
                                        ) : (
                                            <div className="text-center p-6 lg:p-8">
                                                <div className="text-blue-400 mb-4">
                                                    <svg className="w-12 lg:w-16 h-12 lg:h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                                    </svg>
                                                </div>
                                                <p className="text-gray-600 italic text-sm lg:text-base">Click Calculate to generate crossflow velocity profile</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

}

export default BoundaryLayer;
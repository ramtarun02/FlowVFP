import React, { useState, useEffect, useMemo } from "react";
import Plot from "react-plotly.js";
import { useNavigate } from "react-router-dom";
import { useSimulationData } from "../components/SimulationDataContext";
import { fetchAPI } from '../utils/fetch';
import { getResultFileAsBlob } from '../utils/vfpPostParser';
import { downloadPlotDataAsCSV } from '../utils/downloadPlotCSV';

function ContourPlot() {
    const navigate = useNavigate();
    const {
        simulationData, parsedCpData, setParsedCpData,
        importMode, vfpManifest, vfpFileName,
    } = useSimulationData();

    // --- VFP flow key selection (local to this component) ---
    const [selectedVfpConfig, setSelectedVfpConfig] = useState('wingConfig');
    const [selectedVfpFlowKey, setSelectedVfpFlowKey] = useState('');
    const [isLoadingCp, setIsLoadingCp] = useState(false);
    const [loadError, setLoadError] = useState(null);

    // Derive flow keys
    const vfpWingFlowKeys = useMemo(() => {
        if (!vfpManifest?.wingConfig) return [];
        return Object.keys(vfpManifest.wingConfig).sort();
    }, [vfpManifest]);

    const vfpTailFlowKeys = useMemo(() => {
        if (!vfpManifest?.tailConfig) return [];
        return Object.keys(vfpManifest.tailConfig).sort();
    }, [vfpManifest]);

    // Derive CP files for selected flow key
    const vfpCpFiles = useMemo(() => {
        if (importMode !== 'vfp' || !vfpManifest || !selectedVfpFlowKey || !selectedVfpConfig) return [];
        const flowEntry = vfpManifest[selectedVfpConfig]?.[selectedVfpFlowKey];
        if (!flowEntry?.fileTypes?.cp) return [];
        return flowEntry.fileTypes.cp.map(name => ({ name, configKey: selectedVfpConfig, flowKey: selectedVfpFlowKey }));
    }, [importMode, vfpManifest, selectedVfpFlowKey, selectedVfpConfig]);

    // Handle VFP CP file selection
    const handleVfpCpSelect = async (cpFileInfo) => {
        setIsLoadingCp(true);
        setLoadError(null);
        try {
            const blob = await getResultFileAsBlob(cpFileInfo.configKey, cpFileInfo.flowKey, cpFileInfo.name);
            if (!blob) throw new Error(`File "${cpFileInfo.name}" not found in local storage`);

            const formData = new FormData();
            formData.append('file', blob, cpFileInfo.name);
            formData.append('fileName', cpFileInfo.name);

            const response = await fetchAPI('/api/post/parse-cp', { method: 'POST', body: formData });
            if (!response.ok) throw new Error(`Parse error: ${response.status}`);
            const data = await response.json();
            setParsedCpData(data);
        } catch (err) {
            console.error('[ContourPlot] Error loading VFP CP file:', err);
            setLoadError(err.message);
        } finally {
            setIsLoadingCp(false);
        }
    };

    // Handle folder-mode CP file selection (from simulationData.files)
    const folderCpFiles = useMemo(() => {
        if (importMode === 'vfp' || !simulationData?.files?.cp) return [];
        return simulationData.files.cp;
    }, [importMode, simulationData]);

    const handleFolderCpSelect = async (cpFile) => {
        if (!cpFile?.file) return;
        setIsLoadingCp(true);
        setLoadError(null);
        try {
            const formData = new FormData();
            formData.append('file', cpFile.file);
            formData.append('fileName', cpFile.name);

            const response = await fetchAPI('/api/post/parse-cp', { method: 'POST', body: formData });
            if (!response.ok) throw new Error(`Parse error: ${response.status}`);
            const data = await response.json();
            setParsedCpData(data);
        } catch (err) {
            console.error('[ContourPlot] Error loading folder CP file:', err);
            setLoadError(err.message);
        } finally {
            setIsLoadingCp(false);
        }
    };

    const cpData = parsedCpData;

    // Plot config states
    const [levels, setLevels] = useState([]);
    const [selectedLevel, setSelectedLevel] = useState("");
    const [contourType, setContourType] = useState("CP");
    const [contourLevels, setContourLevels] = useState(50);
    const [showContourLines, setShowContourLines] = useState(true);
    const [plotData, setPlotData] = useState(null);
    const [minValue, setMinValue] = useState(0);
    const [maxValue, setMaxValue] = useState(1);

    // When parsed CP data is not available, reset plots
    useEffect(() => {
        if (!cpData) {
            setLevels([]);
            setSelectedLevel("");
            setPlotData(null);
        }
    }, [cpData]);

    // Levels dropdown
    useEffect(() => {
        if (cpData && cpData.levels) {
            const levelOptions = Object.keys(cpData.levels).map(levelKey => {
                const match = levelKey.match(/level(\d+)/);
                const num = match ? parseInt(match[1]) : 1;
                return {
                    value: levelKey,
                    label: `Level ${num}`,
                    levelNumber: num
                };
            });
            levelOptions.sort((a, b) => b.levelNumber - a.levelNumber);
            setLevels(levelOptions);
            if (!selectedLevel && levelOptions.length > 0) {
                setSelectedLevel(levelOptions[0].value);
            }
        }
    }, [cpData, selectedLevel]);

    // Value range for colorbar
    useEffect(() => {
        if (!cpData || !selectedLevel) return;
        const levelObj = cpData.levels[selectedLevel];
        if (!levelObj) return;

        let allVals = [];
        Object.values(levelObj.sections || {}).forEach(section => {
            if (section && section[contourType]) {
                allVals = allVals.concat(section[contourType]);
            }
        });
        if (allVals.length > 0) {
            setMinValue(Math.min(...allVals));
            setMaxValue(Math.max(...allVals));
        }
    }, [cpData, selectedLevel, contourType]);

    function computeContourLines(grid, numLevels, minVal, maxVal) {
        const allX = [], allY = [], allZ = [];
        const lerp = (i1, j1, i2, j2, t) => ({
            x: grid.x[i1][j1] + t * (grid.x[i2][j2] - grid.x[i1][j1]),
            y: grid.y[i1][j1] + t * (grid.y[i2][j2] - grid.y[i1][j1]),
            z: grid.z[i1][j1] + t * (grid.z[i2][j2] - grid.z[i1][j1]),
        });
        for (let n = 1; n < numLevels; n++) {
            const level = minVal + (maxVal - minVal) * n / numLevels;
            for (let i = 0; i < grid.x.length - 1; i++) {
                const rowLen = Math.min(grid.x[i].length, grid.x[i + 1].length);
                for (let j = 0; j < rowLen - 1; j++) {
                    const v00 = grid.value[i][j], v01 = grid.value[i][j + 1];
                    const v10 = grid.value[i + 1][j], v11 = grid.value[i + 1][j + 1];
                    if (v00 == null || v01 == null || v10 == null || v11 == null) continue;
                    const edges = [];
                    if ((v00 - level) * (v01 - level) < 0) {
                        edges.push(lerp(i, j, i, j + 1, (level - v00) / (v01 - v00)));
                    }
                    if ((v10 - level) * (v11 - level) < 0) {
                        edges.push(lerp(i + 1, j, i + 1, j + 1, (level - v10) / (v11 - v10)));
                    }
                    if ((v00 - level) * (v10 - level) < 0) {
                        edges.push(lerp(i, j, i + 1, j, (level - v00) / (v10 - v00)));
                    }
                    if ((v01 - level) * (v11 - level) < 0) {
                        edges.push(lerp(i, j + 1, i + 1, j + 1, (level - v01) / (v11 - v01)));
                    }
                    if (edges.length >= 2) {
                        allX.push(edges[0].x, edges[1].x, null);
                        allY.push(edges[0].y, edges[1].y, null);
                        allZ.push(edges[0].z, edges[1].z, null);
                    }
                    if (edges.length === 4) {
                        allX.push(edges[2].x, edges[3].x, null);
                        allY.push(edges[2].y, edges[3].y, null);
                        allZ.push(edges[2].z, edges[3].z, null);
                    }
                }
            }
        }
        return { x: allX, y: allY, z: allZ };
    }

    function buildSurfaceGrid(cpData, selectedLevel, contourType) {
        if (!cpData || !selectedLevel || !cpData.levels[selectedLevel]) return null;
        const levelObj = cpData.levels[selectedLevel];
        const sections = levelObj.sections || {};

        // Sort sections by YAVE
        const sortedSections = Object.values(sections).sort((a, b) => {
            const ya = a.coefficients?.YAVE ?? parseFloat(a.sectionHeader?.match(/YAVE=\s*([\d.-]+)/)?.[1] ?? 0);
            const yb = b.coefficients?.YAVE ?? parseFloat(b.sectionHeader?.match(/YAVE=\s*([\d.-]+)/)?.[1] ?? 0);
            return ya - yb;
        });

        // Build grids
        let xGrid = [];
        let yGrid = [];
        let zGrid = [];
        let valGrid = [];

        sortedSections.forEach(section => {
            const xphys = section.XPHYS || [];
            const yave = section.coefficients?.YAVE ?? parseFloat(section.sectionHeader?.match(/YAVE=\s*([\d.-]+)/)?.[1] ?? 0);
            const zphys = section.ZPHYS && section.ZPHYS.length === xphys.length ? section.ZPHYS : Array(xphys.length).fill(0);
            const vals = section[contourType] || [];

            if (xphys.length === vals.length && xphys.length === zphys.length) {
                xGrid.push(xphys);
                yGrid.push(Array(xphys.length).fill(yave));
                zGrid.push(zphys);
                valGrid.push(vals);
            }
        });

        if (xGrid.length === 0) return null;

        return {
            x: xGrid,
            y: yGrid,
            z: zGrid,
            value: valGrid
        };
    }

    useEffect(() => {
        if (!cpData || !selectedLevel || !cpData.levels[selectedLevel]) {
            setPlotData(null);
            return;
        }
        const grid = buildSurfaceGrid(cpData, selectedLevel, contourType);
        if (!grid || grid.x.length === 0) {
            setPlotData(null);
            return;
        }

        // Extract YTIP from flowParameters string and round to nearest integer
        let yAspect = 2.0; // default
        const flowParams = cpData.levels[selectedLevel]?.flowParameters;
        if (flowParams && typeof flowParams === "string") {
            const match = flowParams.match(/YTIP=\s*([\d.]+)/);
            if (match && match[1]) {
                yAspect = Math.round(parseFloat(match[1]));
            }
        }

        const traces = [
            {
                type: "surface",
                x: grid.x,
                y: grid.y,
                z: grid.z,
                surfacecolor: grid.value,
                colorscale: "Jet",
                colorbar: {
                    title: contourType,
                    titleside: "right"
                },
                cmin: minValue,
                cmax: maxValue,
                showscale: true
            }
        ];

        if (showContourLines) {
            const contourLines = computeContourLines(grid, contourLevels, minValue, maxValue);
            if (contourLines.x.length > 0) {
                traces.push({
                    type: "scatter3d",
                    mode: "lines",
                    x: contourLines.x,
                    y: contourLines.y,
                    z: contourLines.z,
                    line: { color: "black", width: 2 },
                    showlegend: false,
                    hoverinfo: "skip"
                });
            }
        }

        setPlotData({
            data: traces,
            layout: {
                title: `${contourType} Distribution - 3D Wing Surface`,
                scene: {
                    xaxis: { title: "XPHYS" },
                    yaxis: { title: "YAVE" },
                    zaxis: { title: "ZPHYS" },
                    aspectratio: { x: 1, y: yAspect, z: 0.25 }
                },
                margin: { l: 0, r: 0, t: 50, b: 0 },
                paper_bgcolor: "white",
                plot_bgcolor: "white",
                autosize: true
            },
            config: {
                displayModeBar: true,
                displaylogo: false,
                responsive: true
            }
        });
    }, [cpData, selectedLevel, contourType, contourLevels, showContourLines, minValue, maxValue]);

    // UI
    return (
        <div className="flex flex-col h-screen bg-blue-50 font-sans">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-blue-200 shadow-sm">
                <h1 className="text-xl font-semibold text-gray-800">3D Wing Contour Visualization</h1>
                <button
                    onClick={() => navigate("/post-processing")}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium"
                >
                    Back to Post-Processing
                </button>
            </div>
            {/* Content */}
            <div className="flex flex-1 overflow-hidden">
                {/* Controls Sidebar */}
                <div className="w-80 bg-white border-r border-blue-200 p-4 overflow-y-auto flex-shrink-0">
                    <div className="mb-6">
                        <h3 className="text-lg font-semibold text-gray-800 mb-3 pb-2 border-b-2 border-blue-400">
                            File Information
                        </h3>
                        <div className="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-400">
                            <p className="mb-2 text-sm">
                                <span className="font-semibold text-gray-700">Simulation:</span>
                                <span className="text-gray-900"> {simulationData?.simName || vfpFileName || "N/A"}</span>
                            </p>
                            <p className="text-sm">
                                <span className="font-semibold text-gray-700">CP Data:</span>
                                <span className="text-gray-900"> {cpData ? '✓ Loaded' : isLoadingCp ? '⏳ Loading...' : '○ Not loaded'}</span>
                            </p>
                            {loadError && (
                                <p className="text-xs text-red-500 mt-1">{loadError}</p>
                            )}
                        </div>
                    </div>

                    {/* ── VFP Mode: Flow Key + CP file selection ── */}
                    {importMode === 'vfp' && vfpManifest && (
                        <div className="mb-6">
                            <h3 className="text-lg font-semibold text-gray-800 mb-3 pb-2 border-b-2 border-green-400">
                                Select CP File
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
                            {/* CP files for selected flow key */}
                            {vfpCpFiles.length > 0 && (
                                <div className="mt-2">
                                    <label className="block text-xs font-medium text-gray-700 mb-1">CP Files</label>
                                    <div className="flex flex-col gap-1 max-h-32 overflow-y-auto border border-blue-200 rounded-lg p-2 bg-blue-50">
                                        {vfpCpFiles.map((cf, idx) => (
                                            <div
                                                key={idx}
                                                className={`flex items-center p-2 bg-white border border-blue-200 rounded-lg cursor-pointer transition-all duration-200 hover:bg-blue-50 hover:border-blue-400 hover:shadow-sm ${isLoadingCp ? 'opacity-60 cursor-wait' : ''}`}
                                                onClick={() => !isLoadingCp && handleVfpCpSelect(cf)}
                                                title={`Click to load ${cf.name}`}
                                            >
                                                <span className="text-sm mr-2">{isLoadingCp ? '⏳' : '📄'}</span>
                                                <span className="flex-1 text-xs font-medium text-gray-800 truncate">{cf.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {selectedVfpFlowKey && vfpCpFiles.length === 0 && (
                                <p className="text-xs text-gray-500 italic mt-1">No .cp files found for this flow key</p>
                            )}
                        </div>
                    )}

                    {/* ── Folder Mode: CP file selection ── */}
                    {importMode === 'folder' && folderCpFiles.length > 0 && !cpData && (
                        <div className="mb-6">
                            <h3 className="text-lg font-semibold text-gray-800 mb-3 pb-2 border-b-2 border-blue-400">
                                Select CP File
                            </h3>
                            <div className="flex flex-col gap-1 max-h-32 overflow-y-auto border border-blue-200 rounded-lg p-2 bg-blue-50">
                                {folderCpFiles.map((cf, idx) => (
                                    <div
                                        key={idx}
                                        className={`flex items-center p-2 bg-white border border-blue-200 rounded-lg cursor-pointer transition-all duration-200 hover:bg-blue-50 hover:border-blue-400 ${isLoadingCp ? 'opacity-60 cursor-wait' : ''}`}
                                        onClick={() => !isLoadingCp && handleFolderCpSelect(cf)}
                                        title={`Click to load ${cf.name}`}
                                    >
                                        <span className="text-sm mr-2">{isLoadingCp ? '⏳' : '📄'}</span>
                                        <span className="flex-1 text-xs font-medium text-gray-800 truncate">{cf.name}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    <div className="mb-6">
                        <h3 className="text-lg font-semibold text-gray-800 mb-3 pb-2 border-b-2 border-blue-400">
                            Plot Configuration
                        </h3>
                        {/* Level Selection */}
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Level</label>
                            <select
                                value={selectedLevel}
                                onChange={e => setSelectedLevel(e.target.value)}
                                className="w-full px-3 py-2 border border-blue-300 rounded-lg bg-white text-gray-900"
                            >
                                <option value="">Select Level</option>
                                {levels.map(level => (
                                    <option key={level.value} value={level.value}>{level.label}</option>
                                ))}
                            </select>
                        </div>
                        {/* Contour Type */}
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Contour Type</label>
                            <select
                                value={contourType}
                                onChange={e => setContourType(e.target.value)}
                                className="w-full px-3 py-2 border border-blue-300 rounded-lg bg-white text-gray-900"
                            >
                                <option value="CP">Pressure Coefficient (CP)</option>
                                <option value="M">Mach Number</option>
                            </select>
                        </div>
                        {/* Contour Lines Toggle */}
                        <div className="mb-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={showContourLines}
                                    onChange={e => setShowContourLines(e.target.checked)}
                                    className="w-4 h-4 text-blue-600 border-blue-300 rounded focus:ring-blue-500"
                                />
                                <span className="text-sm font-medium text-gray-700">Show Contour Lines</span>
                            </label>
                        </div>
                        {/* Contour Levels */}
                        {showContourLines && (
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Contour Lines: {contourLevels}
                                </label>
                                <input
                                    type="range"
                                    min="10"
                                    max="100"
                                    value={contourLevels}
                                    onChange={e => setContourLevels(parseInt(e.target.value) || 50)}
                                    className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer slider"
                                />
                                <div className="flex justify-between text-xs text-gray-500 mt-1">
                                    <span>10</span>
                                    <span>100</span>
                                </div>
                            </div>
                        )}
                    </div>
                    {/* Value Range Display */}
                    {selectedLevel && (
                        <div className="mb-6">
                            <h3 className="text-lg font-semibold text-gray-800 mb-3 pb-2 border-b-2 border-blue-400">
                                Value Range
                            </h3>
                            <div className="bg-green-50 p-4 rounded-lg border-l-4 border-green-400">
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center py-1">
                                        <span className="font-semibold text-gray-700 text-sm">Min:</span>
                                        <span className="font-mono text-gray-900 text-xs">{minValue.toFixed(6)}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-1">
                                        <span className="font-semibold text-gray-700 text-sm">Max:</span>
                                        <span className="font-mono text-gray-900 text-xs">{maxValue.toFixed(6)}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-1">
                                        <span className="font-semibold text-gray-700 text-sm">Range:</span>
                                        <span className="font-mono text-gray-900 text-xs">
                                            {(maxValue - minValue).toFixed(6)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                {/* Main Plot Area */}
                <div className="flex-1 flex flex-col p-4 bg-white overflow-hidden">
                    {plotData ? (
                        <div className="flex-1 border border-blue-200 rounded-xl overflow-hidden bg-white shadow-sm relative">
                            <Plot
                                data={plotData.data}
                                layout={plotData.layout}
                                config={plotData.config}
                                style={{ width: "100%", height: "100%" }}
                                useResizeHandler={true}
                            />
                            <button onClick={() => downloadPlotDataAsCSV(plotData, 'contour-data')} title="Download CSV" className="absolute top-2 left-2 z-20 p-1.5 bg-white/80 hover:bg-blue-100 border border-blue-300 rounded-lg shadow-sm transition-colors duration-150">
                              <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3" /></svg>
                            </button>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col justify-center items-center text-center">
                            <h2 className="text-3xl font-semibold text-gray-800 mb-4">
                                Welcome to 3D Wing Contour Visualization
                            </h2>
                            <p className="text-gray-600 text-lg mb-6">
                                {importMode === 'vfp'
                                    ? 'Select a flow key and CP file from the sidebar to display 3D contour plots.'
                                    : 'Select a CP file from the sidebar or load one in Post-Processing, then pick a level to display 3D contour plots.'}
                            </p>
                        </div>
                    )}
                </div>
            </div>
            {/* Custom slider thumb styling for Tailwind */}
            <style>{`
                .slider::-webkit-slider-thumb {
                    appearance: none;
                    width: 20px;
                    height: 20px;
                    border-radius: 50%;
                    background: #3b82f6;
                    cursor: pointer;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
                }
                .slider::-moz-range-thumb {
                    width: 20px;
                    height: 20px;
                    border-radius: 50%;
                    background: #3b82f6;
                    cursor: pointer;
                    border: none;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
                }
            `}</style>
        </div>
    );
}

export default ContourPlot;
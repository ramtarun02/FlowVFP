import React, { useState, useEffect } from "react";
import Plot from "react-plotly.js";
import { useNavigate } from "react-router-dom";
import { useSimulationData } from "../components/SimulationDataContext";

function ContourPlot() {
    const navigate = useNavigate();
    const { simulationData, parsedCpData } = useSimulationData();

    const cpData = parsedCpData;

    // Plot config states
    const [levels, setLevels] = useState([]);
    const [selectedLevel, setSelectedLevel] = useState("");
    const [contourType, setContourType] = useState("CP");
    const [contourLevels, setContourLevels] = useState(50);
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

        setPlotData({
            data: [
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
            ],
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
    }, [cpData, selectedLevel, contourType, minValue, maxValue]);

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
                                <span className="text-gray-900"> {simulationData?.simName || "N/A"}</span>
                            </p>
                            <p className="text-sm">
                                <span className="font-semibold text-gray-700">CP File:</span>
                                <span className="text-gray-900"> {simulationData?.selectedFiles?.cp?.name || "Current CP selection"}</span>
                            </p>
                        </div>
                    </div>
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
                        {/* Contour Levels
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Contour Levels: {contourLevels}
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
                        </div> */}
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
                        <div className="flex-1 border border-blue-200 rounded-xl overflow-hidden bg-white shadow-sm">
                            <Plot
                                data={plotData.data}
                                layout={plotData.layout}
                                config={plotData.config}
                                style={{ width: "100%", height: "100%" }}
                                useResizeHandler={true}
                            />
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col justify-center items-center text-center">
                            <h2 className="text-3xl font-semibold text-gray-800 mb-4">
                                Welcome to 3D Wing Contour Visualization
                            </h2>
                            <p className="text-gray-600 text-lg mb-6">
                                Load a CP file in VFP Post, then pick a level to display 3D contour plots.
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
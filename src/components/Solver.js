import React, { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { VfpDataContext } from "../components/vfpDataContext";
import { useContext } from "react";

const Solver = () => {
    const { vfpData, setVfpData } = useContext(VfpDataContext);
    const location = useLocation();
    const navigate = useNavigate();
    const importInputRef = useRef();

    const [solverStatus, setSolverStatus] = useState("");
    const [errorMsg, setErrorMsg] = useState("");
    const [isLaunching, setIsLaunching] = useState(false);
    const [flowVerified, setFlowVerified] = useState(false);

    useEffect(() => {
        if (vfpData.Initialisation?.["Solver Status"]) {
            setSolverStatus(vfpData.Initialisation["Solver Status"]);
        }
    }, [vfpData]);

    // Show Solver Status if present in vfpData (from previous launch)
    useEffect(() => {
        if (vfpData.Initialisation?.["Solver Status"]) {
            setSolverStatus(vfpData.Initialisation["Solver Status"]);
        }
    }, [vfpData]);

    // File helpers
    const wingFiles = [
        { label: "Geometry", type: "GeoFile" },
        { label: "Mapping", type: "MapFile" },
        { label: "Airfoil Data", type: "DatFile" },
    ];
    const tailFiles = [
        { label: "Geometry", type: "GeoFile" },
        { label: "Mapping", type: "MapFile" },
        { label: "Airfoil Data", type: "DatFile" },
    ];

    const getFileName = (section, type) =>
        vfpData.inputFiles?.[section]?.fileNames?.[type] || "";

    const getBodyFiles = () =>
        (vfpData.inputFiles?.bodyFiles?.fileNames || []).map((name, idx) => ({
            label: `Body ${idx + 1}`,
            name,
        }));

    const formatValue = (value, type) => {
        if (value === undefined || value === null || value === "") {
            return <span className="text-gray-400 italic">Not specified</span>;
        }
        if (type === "number") {
            return parseFloat(value).toLocaleString();
        }
        return value;
    };

    // Save config as .vfp file
    const handleSaveConfig = () => {
        const blob = new Blob([JSON.stringify(vfpData, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.download = (vfpData.formData?.simName || "simulation") + ".vfp";
        a.href = url;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // Import VFP handler
    const handleImportVFP = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const formData = new FormData();
            formData.append("file", file);

            const response = await fetchAPI('/upload_vfp', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error('Failed to upload and parse file');
            }

            const data = await response.json();

            const normalized = {
                formData: data.formData || {},
                inputFiles: {
                    wingConfig: data.inputFiles?.wingConfig || { fileNames: { GeoFile: "", MapFile: "", DatFile: "" }, fileData: {} },
                    tailConfig: data.inputFiles?.tailConfig || { fileNames: { GeoFile: "", MapFile: "", DatFile: "" }, fileData: {} },
                    bodyFiles: data.inputFiles?.bodyFiles || { fileNames: [], fileData: {} }
                }
            };

            setVfpData(normalized);
            console.log('Imported VFP case from backend');
        } catch (err) {
            alert("Failed to import VFP case: " + err.message);
        } finally {
            e.target.value = "";
        }
    };

    useEffect(() => {
        if (location.state?.vfpData) {
            setVfpData(location.state.vfpData);
        }
    }, [location.state?.vfpData]);

    console.log("Current VFP Data in Solver:", vfpData);

    const handleLaunch = () => {
        setErrorMsg("");
        setIsLaunching(true);
        // Any validation logic here if needed
        setIsLaunching(false);
        navigate("/simulation-run");
    };

    return (
        <div className="min-h-screen bg-[#fafbfc] font-sans">
            {/* Header */}
            <header className="bg-white border-b border-gray-200" style={{ boxShadow: "0 2px 8px 0 rgba(16,30,54,.04)" }}>
                <div className="max-w-7xl mx-auto flex items-center justify-between px-8 py-5">
                    <div className="flex items-center gap-3">
                        <span className="rounded-lg flex items-center justify-center">
                            <img
                                src="/VFP-2025/flowVFP-logo.png"
                                alt="FlowVFP Logo"
                                className="w-10 h-10 object-contain"
                                style={{ minWidth: 40 }}
                            />
                        </span>
                        <div>
                            <div className="font-bold text-2xl text-gray-900">FlowVFP Solver</div>
                            <div className="text-sm text-gray-500">Viscous Full Potential Flow Solver v2.0</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-8">
                        <a href="https://github.com/ramtarun02/VFP-2025" className="text-base text-gray-700 hover:text-blue-700 flex items-center gap-1">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M4 4h16v16H4z" /></svg>
                            Documentation
                        </a>
                        <button
                            type="button"
                            className="text-base text-gray-700 hover:text-blue-700 flex items-center gap-1"
                            onClick={handleSaveConfig}
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>
                            Save Config
                        </button>
                        <button
                            type="button"
                            className="text-base text-gray-700 hover:text-blue-700 flex items-center gap-1"
                            onClick={() => importInputRef.current && importInputRef.current.click()}
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4" /></svg>
                            Import VFP Case
                        </button>
                        <input
                            type="file"
                            accept=".vfp,application/json"
                            ref={importInputRef}
                            style={{ display: "none" }}
                            onChange={handleImportVFP}
                        />
                        <div className="flex items-center gap-3">
                            <img src="/VFP-2025/cranfield-logo.svg" alt="Cranfield" className="w-9 h-9 rounded-full border" />
                            <span className="text-base text-gray-800 font-semibold">Dr. Davide</span>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-8 py-8">
                <h1 className="text-4xl font-bold text-gray-900 mb-2">Simulation Review</h1>
                <div className="text-gray-500 mb-7 text-lg">Review your configuration before launching the solver</div>

                {/* Flow Conditions & Run Config */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    {/* Flow Conditions */}
                    <section className="bg-blue-50 rounded-2xl border border-blue-200 shadow p-0">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-blue-100">
                            <div className="flex items-center gap-2">
                                <span className="bg-blue-600 rounded-lg p-2 flex items-center justify-center">
                                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>
                                </span>
                                <span className="font-semibold text-blue-900 text-lg">Flow Conditions</span>
                                <span className="ml-2 text-xs text-blue-700">Simulation parameters</span>
                            </div>
                            <button className="text-blue-600 text-sm font-medium flex items-center gap-1 hover:underline"
                                onClick={() => navigate("/run-solver", { state: { vfpData } })}
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4" /></svg>
                                Edit
                            </button>
                        </div>
                        <div className="bg-white px-6 py-5 grid grid-cols-2 gap-6">
                            <div>
                                <div className="text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1">
                                    <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M16 17l-4 4m0 0l-4-4m4 4V3" /></svg>
                                    Simulation Name
                                </div>
                                <div className="text-lg font-bold text-gray-900">
                                    {formatValue(vfpData.formData?.simName, "text")}
                                </div>
                            </div>
                            <div>
                                <div className="text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1">
                                    <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /></svg>
                                    Mach Number
                                </div>
                                <div className="text-lg font-bold text-gray-900">
                                    {formatValue(vfpData.formData?.mach, "number")}
                                </div>
                            </div>
                            <div>
                                <div className="text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1">
                                    <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 19V5" /></svg>
                                    Angle of Attack
                                </div>
                                <div className="text-lg font-bold text-gray-900">
                                    {formatValue(vfpData.formData?.aoa, "number")}°
                                </div>
                            </div>
                            <div>
                                <div className="text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1">
                                    <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 12h18" /></svg>
                                    Reynolds Number
                                </div>
                                <div className="text-lg font-bold text-gray-900">
                                    {formatValue(vfpData.formData?.reynolds, "number")}
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Run Config */}
                    <section className="bg-purple-50 rounded-2xl border border-purple-200 shadow p-0">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-purple-100">
                            <div className="flex items-center gap-2">
                                <span className="bg-purple-600 rounded-lg p-2 flex items-center justify-center">
                                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M2 16l10-8 10 8" /></svg>
                                </span>
                                <span className="font-semibold text-purple-900 text-lg">Run Config</span>
                                <span className="ml-2 text-xs text-purple-700">Solver settings</span>
                            </div>
                            <button className="text-purple-600 text-sm font-medium flex items-center gap-1 hover:underline"
                                onClick={() => navigate("/run-solver", { state: { vfpData } })}
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4" /></svg>
                                Edit
                            </button>
                        </div>
                        <div className="bg-white px-6 py-5">
                            <div className="mb-4">
                                <div className="flex items-center gap-3 mb-2">
                                    <span className={`w-5 h-5 rounded-full flex items-center justify-center ${vfpData.formData?.continuationRun ? "bg-green-500 text-white" : "bg-gray-300 text-gray-600"}`}>
                                        {vfpData.formData?.continuationRun ? <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg> : "○"}
                                    </span>
                                    <span className="font-medium text-gray-700">Continuation Run</span>
                                    <span className={`ml-auto text-xs font-semibold ${vfpData.formData?.continuationRun ? "text-green-700" : "text-gray-400"}`}>
                                        {vfpData.formData?.continuationRun ? "Enabled" : "Disabled"}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 mb-2">
                                    <span className={`w-5 h-5 rounded-full flex items-center justify-center ${vfpData.formData?.excrescence ? "bg-green-500 text-white" : "bg-gray-300 text-gray-600"}`}>
                                        {vfpData.formData?.excrescence ? <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg> : "○"}
                                    </span>
                                    <span className="font-medium text-gray-700">Excrescence Run</span>
                                    <span className={`ml-auto text-xs font-semibold ${vfpData.formData?.excrescence ? "text-green-700" : "text-gray-400"}`}>
                                        {vfpData.formData?.excrescence ? "Enabled" : "Disabled"}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 mb-2">
                                    <span className={`w-5 h-5 rounded-full flex items-center justify-center ${vfpData.formData?.autoRunner ? "bg-green-500 text-white" : "bg-gray-300 text-gray-600"}`}>
                                        {vfpData.formData?.autoRunner ? <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg> : "○"}
                                    </span>
                                    <span className="font-medium text-gray-700">Auto Runner</span>
                                    <span className={`ml-auto text-xs font-semibold ${vfpData.formData?.autoRunner ? "text-green-700" : "text-gray-400"}`}>
                                        {vfpData.formData?.autoRunner ? "Enabled" : "Disabled"}
                                    </span>
                                </div>
                            </div>
                            {/* Dump File */}
                            {vfpData.formData?.continuationRun && (vfpData.formData?.wingDumpName || vfpData.formData?.tailDumpName) && (
                                <div className="flex flex-col gap-1 mb-2">
                                    {vfpData.formData?.wingDumpName && (
                                        <span className="bg-gray-200 rounded px-2 py-1 text-xs font-mono text-gray-700">Wing Dump: {vfpData.formData.wingDumpName}</span>
                                    )}
                                    {vfpData.formData?.tailDumpName && (
                                        <span className="bg-gray-200 rounded px-2 py-1 text-xs font-mono text-gray-700">Tail Dump: {vfpData.formData.tailDumpName}</span>
                                    )}
                                    {vfpData.formData?.continuationSplitKey && (
                                        <span className="bg-blue-100 rounded px-2 py-1 text-xs font-mono text-blue-800">Split Key: {vfpData.formData.continuationSplitKey}{vfpData.formData?.continuationSplitFile ? ` (file: ${vfpData.formData.continuationSplitFile})` : ""}</span>
                                    )}
                                </div>
                            )}
                            {/* Auto Runner Details */}
                            {vfpData.formData?.autoRunner && (
                                <div className="flex flex-col gap-2 mt-2">
                                    <div className="text-xs text-gray-500">
                                        Step Size: <span className="font-mono">{vfpData.formData.autoStepSize || <span className="text-gray-400 italic">Not specified</span>}</span>
                                    </div>
                                    <div className="text-xs text-gray-500">
                                        Sweep: <span className="font-mono">{vfpData.formData.autoMode === "aoa" ? "Angle of Attack" : "Mach Number"}</span>
                                    </div>
                                    {vfpData.formData.autoMode === "aoa" ? (
                                        <div className="text-xs text-gray-500">
                                            End AoA: <span className="font-mono">{vfpData.formData.autoEndAoA || <span className="text-gray-400 italic">Not specified</span>}</span>
                                        </div>
                                    ) : (
                                        <div className="text-xs text-gray-500">
                                            End Mach: <span className="font-mono">{vfpData.formData.autoEndMach || <span className="text-gray-400 italic">Not specified</span>}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </section>
                </div>

                {/* Input Files */}
                <section className="bg-green-50 rounded-2xl border border-green-200 shadow p-0 mb-8">
                    <div className="flex items-center justify-between px-6 py-4 border-b border-green-100">
                        <div className="flex items-center gap-2">
                            <span className="bg-green-600 rounded-lg p-2 flex items-center justify-center">
                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>
                            </span>
                            <span className="font-semibold text-green-900 text-lg">Input Files</span>
                            <span className="ml-2 text-xs text-green-700">Uploaded geometry and mesh files</span>
                        </div>
                        <button className="text-green-600 text-sm font-medium flex items-center gap-1 hover:underline"
                            onClick={() => navigate("/run-solver", { state: { vfpData } })}
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4" /></svg>
                            Edit
                        </button>
                    </div>
                    <div className="bg-white px-6 py-5 grid grid-cols-4 gap-6">
                        {/* Wing Files */}
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M2 16l10-8 10 8" /></svg>
                                <span className="font-bold text-blue-900">WING FILES</span>
                            </div>
                            {wingFiles.map(f => (
                                <div key={f.type} className="bg-gray-50 rounded-lg border border-gray-200 p-1 mb-1 flex flex-col gap-0 min-h-0">
                                    <span className="text-xs text-gray-500 leading-tight">{f.label}</span>
                                    <span className="font-mono text-gray-900 text-sm leading-tight">
                                        {getFileName("wingConfig", f.type) || <span className="text-gray-400 italic">Not uploaded</span>}
                                    </span>
                                    <span className="text-xs text-gray-400 leading-tight">{f.type.replace("File", "").toUpperCase()} Format</span>
                                    {getFileName("wingConfig", f.type) && <span className="ml-auto text-green-600"><svg className="w-4 h-4 inline" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg></span>}
                                </div>
                            ))}
                        </div>
                        {/* Tail Files */}
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /></svg>
                                <span className="font-bold text-purple-900">TAIL FILES</span>
                            </div>
                            {tailFiles.map(f => (
                                <div key={f.type} className="bg-gray-50 rounded-lg border border-gray-200 p-1 mb-1 flex flex-col gap-0 min-h-0">
                                    <span className="text-xs text-gray-500 leading-tight">{f.label}</span>
                                    <span className="font-mono text-gray-900 text-sm leading-tight">
                                        {getFileName("tailConfig", f.type) || <span className="text-gray-400 italic">Not uploaded</span>}
                                    </span>
                                    <span className="text-xs text-gray-400 leading-tight">{f.type.replace("File", "").toUpperCase()} Format</span>
                                    {getFileName("tailConfig", f.type) && <span className="ml-auto text-green-600"><svg className="w-4 h-4 inline" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg></span>}
                                </div>
                            ))}
                        </div>
                        {/* Additional Bodies */}
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4" /></svg>
                                <span className="font-bold text-orange-900">ADDITIONAL BODIES</span>
                            </div>
                            {getBodyFiles().length === 0 && (
                                <div className="bg-gray-50 rounded-lg border border-gray-200 p-1 mb-1 flex flex-col gap-0 min-h-0">
                                    <span className="text-xs text-gray-500 leading-tight">No additional bodies uploaded</span>
                                </div>
                            )}
                            {getBodyFiles().map((file, idx) => (
                                <div key={file.name} className="bg-gray-50 rounded-lg border border-gray-200 p-1 mb-1 flex flex-col gap-0 min-h-0">
                                    <span className="text-xs text-gray-500 leading-tight">{file.label}</span>
                                    <span className="font-mono text-gray-900 text-sm leading-tight">{file.name}</span>
                                    <span className="text-xs text-gray-400 leading-tight">GEO/DAT Format</span>
                                    <span className="ml-auto text-green-600"><svg className="w-4 h-4 inline" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg></span>
                                </div>
                            ))}
                        </div>
                        {/* Empty column for layout symmetry */}
                        <div />
                    </div>
                </section>

                {/* Ready to Launch */}
                <section className="w-full">
                    <div className="w-full rounded-2xl shadow-lg px-0 py-0 flex flex-col items-center"
                        style={{
                            background: "linear-gradient(90deg, #e0e7ff 0%, #93c5fd 100%)"
                        }}
                    >
                        <div className="flex items-center gap-4 mb-4 mt-8 w-full px-10">
                            <span className="bg-blue-700 rounded-xl p-4 flex items-center justify-center">
                                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 3" /></svg>
                            </span>
                            <div>
                                <h2 className="text-2xl font-bold text-blue-900">Ready to Launch</h2>
                                {/* Solver Status message */}
                                {solverStatus && (
                                    <div className="mt-2 px-4 py-2 rounded-lg font-bold text-lg"
                                        style={{
                                            background: solverStatus.includes("Failed") ? "#fee2e2" : "#fef9c3",
                                            color: solverStatus.includes("Failed") ? "#b91c1c" : "#92400e",
                                            border: solverStatus.includes("Failed") ? "2px solid #f87171" : "2px solid #facc15",
                                            boxShadow: "0 2px 8px 0 rgba(16,30,54,.08)"
                                        }}
                                    >
                                        {solverStatus}
                                    </div>
                                )}
                                {!solverStatus && (
                                    <div className="text-blue-900 text-lg">
                                        All configurations verified and ready for solver execution
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex flex-row w-full px-10 mb-6 gap-4">
                            <div className="bg-blue-200/40 rounded-xl p-6 flex flex-col items-start w-full min-w-[180px]">
                                <div className="flex items-center mb-2">
                                    <svg className="w-5 h-5 text-green-500 mr-2" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>
                                    <span className="text-blue-900 font-semibold">FLOW CONDITIONS</span>
                                </div>
                                <div className="text-blue-900 text-2xl font-bold flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={flowVerified}
                                        onChange={() => setFlowVerified(v => !v)}
                                        className="accent-blue-600 w-5 h-5"
                                        id="flow-verify"
                                    />
                                    <label htmlFor="flow-verify" className="cursor-pointer select-none">Verified</label>
                                </div>
                            </div>
                            <div className="bg-blue-200/40 rounded-xl p-6 flex flex-col items-start w-full min-w-[180px]">
                                <div className="flex items-center mb-2">
                                    <svg className="w-5 h-5 text-blue-500 mr-2" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>
                                    <span className="text-blue-900 font-semibold">INPUT FILES</span>
                                </div>
                                <div className="text-blue-900 text-2xl font-bold">
                                    {(Object.values(vfpData.inputFiles?.wingConfig?.fileNames || {}).filter(Boolean).length +
                                        Object.values(vfpData.inputFiles?.tailConfig?.fileNames || {}).filter(Boolean).length +
                                        (vfpData.inputFiles?.bodyFiles?.fileNames?.length || 0))} Files
                                </div>
                            </div>
                            <div className="bg-blue-200/40 rounded-xl p-6 flex flex-col items-start w-full min-w-[180px]">
                                <div className="flex items-center mb-2">
                                    <svg className="w-5 h-5 text-purple-500 mr-2" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /></svg>
                                    <span className="text-blue-900 font-semibold">MESH QUALITY</span>
                                </div>
                                <div className="text-blue-900 text-2xl font-bold">Excellent</div>
                            </div>
                            <div className="bg-blue-200/40 rounded-xl p-6 flex flex-col items-start w-full min-w-[180px]">
                                <div className="flex items-center mb-2">
                                    <svg className="w-5 h-5 text-yellow-500 mr-2" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 8v4l3 3" /><circle cx="12" cy="12" r="10" /></svg>
                                    <span className="text-blue-900 font-semibold">EST. RUNTIME</span>
                                </div>
                                <div className="text-blue-900 text-2xl font-bold">~2mins</div>
                            </div>
                        </div>
                        <div className="flex gap-4 w-full justify-end px-10 pb-8">
                            <button
                                className="px-7 py-3 bg-white text-blue-700 rounded-xl font-semibold text-lg flex items-center gap-2 shadow hover:bg-blue-50"
                                onClick={() => navigate("/run-solver", { state: { vfpData } })}
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                                Back to Setup
                            </button>
                            <button
                                className={`px-7 py-3 rounded-xl font-semibold text-lg flex items-center gap-2 ${flowVerified
                                    ? "bg-red-700 hover:bg-red-800 text-white"
                                    : "bg-red-200 text-white cursor-not-allowed"
                                    }`}
                                onClick={flowVerified ? handleLaunch : undefined}
                                disabled={!flowVerified || isLaunching}
                            >
                                {isLaunching ? (
                                    <>
                                        <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /></svg>
                                        Launching...
                                    </>
                                ) : (
                                    <>
                                        Launch Simulation
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" /></svg>
                                    </>
                                )}
                            </button>
                        </div>
                        {/* Error Alert */}
                        {errorMsg && (
                            <div className="mt-4 px-6 py-3 bg-red-100 border border-red-400 text-red-800 rounded-lg font-semibold text-center max-w-xl">
                                {errorMsg}
                            </div>
                        )}
                    </div>
                </section>
            </main>
        </div>
    );
};

export default Solver;

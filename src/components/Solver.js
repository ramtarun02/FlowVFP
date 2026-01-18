import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const Solver = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const result = location.state?.result || {};
    const userInputs = result.user_inputs || {};
    const uploadedFiles = result.uploaded_files || {};

    // Helper functions
    const formatValue = (value, type) => {
        if (value === undefined || value === null || value === "") {
            return <span className="text-gray-400 italic">Not specified</span>;
        }
        if (type === "number") {
            return parseFloat(value).toLocaleString();
        }
        return value;
    };

    // File categories for display (formats and sizes as per your prompt)
    const wingFiles = [
        { label: "Geometry", key: "wing_GEO", file: uploadedFiles.wing_GEO, format: "GEO", size: "" },
        { label: "Mapping", key: "wing_MAP", file: uploadedFiles.wing_MAP, format: "MAP", size: "" },
        { label: "Flow File", key: "wing_DAT", file: uploadedFiles.wing_DAT, format: "FLOW", size: "" },
    ];
    const tailFiles = [
        { label: "Geometry", key: "tail_GEO", file: uploadedFiles.tail_GEO, format: "GEO", size: "" },
        { label: "Mapping", key: "tail_MAP", file: uploadedFiles.tail_MAP, format: "MAP", size: "" },
        { label: "Flow File", key: "tail_DAT", file: uploadedFiles.tail_DAT, format: "FLOW", size: "" },
    ];
    // All body files (dynamic, not static keys)
    const bodyFiles = Object.keys(uploadedFiles)
        .filter(key => key !== "wing_GEO" && key !== "wing_MAP" && key !== "wing_DAT"
            && key !== "tail_GEO" && key !== "tail_MAP" && key !== "tail_DAT")
        .map((key, idx) => ({
            label: `Body ${idx + 1}`,
            key,
            file: uploadedFiles[key],
            size: ""
        }));

    // Calculate total number of files uploaded
    const totalFilesUploaded = Object.keys(uploadedFiles).length;

    // Launch summary (dynamic)
    const launchSummary = [
        {
            label: "FLOW CONDITIONS",
            value: "Verified",
            icon: <svg className="w-5 h-5 text-green-500 mr-2" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>
        },
        {
            label: "INPUT FILES",
            value: `${totalFilesUploaded} Files`,
            icon: <svg className="w-5 h-5 text-blue-500 mr-2" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>
        },
        {
            label: "MESH QUALITY",
            value: "Excellent",
            icon: <svg className="w-5 h-5 text-purple-500 mr-2" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /></svg>
        },
        {
            label: "EST. RUNTIME",
            value: "~2mins",
            icon: <svg className="w-5 h-5 text-yellow-500 mr-2" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 8v4l3 3" /><circle cx="12" cy="12" r="10" /></svg>
        },
    ];

    // Top summary status
    const summaryStatus = {
        complete: true,
        message: "Configuration Complete"
    };

    // Verification state for flow conditions
    const [flowVerified, setFlowVerified] = useState(false);

    // Launch button handler
    const handleLaunch = () => {
        // Log the HTTP request content (for demonstration)
        console.log("Launching simulation with payload:", {
            userInputs,
            uploadedFiles
        });
        navigate("/simulation-run", { state: { result } });
    };

    return (
        <div className="min-h-screen bg-[#fafbfc] font-sans">
            {/* Header */}
            <header className="bg-white border-b border-gray-200" style={{ boxShadow: "0 2px 8px 0 rgba(16,30,54,.04)" }}>
                <div className="max-w-7xl mx-auto flex items-center justify-between px-8 py-5">
                    <div className="flex items-center gap-3">
                        <span className="bg-blue-600 rounded-lg p-2 flex items-center justify-center">
                            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M2 16l10-8 10 8" /></svg>
                        </span>
                        <div>
                            <div className="font-bold text-2xl text-gray-900">CFD Solver Suite</div>
                            <div className="text-sm text-gray-500">Simulation Review</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-8">
                        <button className="px-5 py-2 bg-gray-100 hover:bg-blue-50 rounded-lg font-semibold text-gray-700 flex items-center gap-2"
                            onClick={() => navigate("/run-solver")}
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                            Back to Setup
                        </button>
                        <button className="px-5 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold text-white flex items-center gap-2">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>
                            Save Config
                        </button>
                        <div className="flex items-center gap-3">
                            <span className="bg-pink-500 text-white rounded-full w-9 h-9 flex items-center justify-center font-bold text-lg">AE</span>
                        </div>
                    </div>
                </div>
            </header>

            {/* Top summary status */}
            <div className="max-w-7xl mx-auto flex justify-end mt-8">
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-5 py-2">
                    <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M9 12l2 2 4-4" /></svg>
                    <span className="text-green-800 font-semibold">{summaryStatus.message}</span>
                </div>
            </div>

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
                            <button className="text-blue-600 text-sm font-medium flex items-center gap-1 hover:underline">
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
                                    {formatValue(userInputs.simName, "text")}
                                </div>
                            </div>
                            <div>
                                <div className="text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1">
                                    <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /></svg>
                                    Mach Number
                                </div>
                                <div className="text-lg font-bold text-gray-900">
                                    {formatValue(userInputs.mach, "number")}
                                </div>
                            </div>
                            <div>
                                <div className="text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1">
                                    <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 19V5" /></svg>
                                    Angle of Attack
                                </div>
                                <div className="text-lg font-bold text-gray-900">
                                    {formatValue(userInputs.aoa, "number")}°
                                </div>
                            </div>
                            <div>
                                <div className="text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1">
                                    <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 12h18" /></svg>
                                    Reynolds Number
                                </div>
                                <div className="text-lg font-bold text-gray-900">
                                    {formatValue(userInputs.reynolds, "number")}
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
                            <button className="text-purple-600 text-sm font-medium flex items-center gap-1 hover:underline">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4" /></svg>
                                Edit
                            </button>
                        </div>
                        <div className="bg-white px-6 py-5">
                            <div className="mb-4">
                                <div className="flex items-center gap-3 mb-2">
                                    <span className={`w-5 h-5 rounded-full flex items-center justify-center ${userInputs.continuation ? "bg-green-500 text-white" : "bg-gray-300 text-gray-600"}`}>
                                        {userInputs.continuation ? <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg> : "○"}
                                    </span>
                                    <span className="font-medium text-gray-700">Continuation Run</span>
                                    <span className={`ml-auto text-xs font-semibold ${userInputs.continuation ? "text-green-700" : "text-gray-400"}`}>
                                        {userInputs.continuation ? "Enabled" : "Disabled"}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 mb-2">
                                    <span className={`w-5 h-5 rounded-full flex items-center justify-center ${userInputs.excrescence ? "bg-green-500 text-white" : "bg-gray-300 text-gray-600"}`}>
                                        {userInputs.excrescence ? <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg> : "○"}
                                    </span>
                                    <span className="font-medium text-gray-700">Excrescence Run</span>
                                    <span className={`ml-auto text-xs font-semibold ${userInputs.excrescence ? "text-green-700" : "text-gray-400"}`}>
                                        {userInputs.excrescence ? "Enabled" : "Disabled"}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 mb-2">
                                    <span className={`w-5 h-5 rounded-full flex items-center justify-center ${userInputs.autoRunner ? "bg-green-500 text-white" : "bg-gray-300 text-gray-600"}`}>
                                        {userInputs.autoRunner ? <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg> : "○"}
                                    </span>
                                    <span className="font-medium text-gray-700">Auto Runner</span>
                                    <span className={`ml-auto text-xs font-semibold ${userInputs.autoRunner ? "text-green-700" : "text-gray-400"}`}>
                                        {userInputs.autoRunner ? "Enabled" : "Disabled"}
                                    </span>
                                </div>
                            </div>
                            {/* Dump File */}
                            {userInputs.continuation && userInputs.dumpName && (
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="bg-gray-200 rounded px-2 py-1 text-xs font-mono text-gray-700">
                                        {userInputs.dumpName}
                                    </span>
                                </div>
                            )}
                            {/* Solver Flags */}
                            {userInputs.solverFlags && (
                                <div className="flex gap-2 flex-wrap mt-2">
                                    {userInputs.solverFlags.map((flag, idx) => (
                                        <span key={idx} className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-mono">{flag}</span>
                                    ))}
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
                        <button className="text-green-600 text-sm font-medium flex items-center gap-1 hover:underline">
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
                            {/* Geometry */}
                            <div className="bg-gray-50 rounded-lg border border-gray-200 p-1 mb-1 flex flex-col gap-0 min-h-0">
                                <span className="text-xs text-gray-500 leading-tight">Geometry</span>
                                <span className="font-mono text-gray-900 text-sm leading-tight">{uploadedFiles.wing_GEO || <span className="text-gray-400 italic">Not uploaded</span>}</span>
                                <span className="text-xs text-gray-400 leading-tight">GEO Format</span>
                                {uploadedFiles.wing_GEO && <span className="ml-auto text-green-600"><svg className="w-4 h-4 inline" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg></span>}
                            </div>
                            {/* Mapping */}
                            <div className="bg-gray-50 rounded-lg border border-gray-200 p-1 mb-1 flex flex-col gap-0 min-h-0">
                                <span className="text-xs text-gray-500 leading-tight">Mapping</span>
                                <span className="font-mono text-gray-900 text-sm leading-tight">{uploadedFiles.wing_MAP || <span className="text-gray-400 italic">Not uploaded</span>}</span>
                                <span className="text-xs text-gray-400 leading-tight">MAP Format</span>
                                {uploadedFiles.wing_MAP && <span className="ml-auto text-green-600"><svg className="w-4 h-4 inline" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg></span>}
                            </div>
                            {/* Flow File */}
                            <div className="bg-gray-50 rounded-lg border border-gray-200 p-1 mb-1 flex flex-col gap-0 min-h-0">
                                <span className="text-xs text-gray-500 leading-tight">Flow File</span>
                                <span className="font-mono text-gray-900 text-sm leading-tight">{uploadedFiles.wing_DAT || <span className="text-gray-400 italic">Not uploaded</span>}</span>
                                <span className="text-xs text-gray-400 leading-tight">FLOW Format</span>
                                {uploadedFiles.wing_DAT && <span className="ml-auto text-green-600"><svg className="w-4 h-4 inline" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg></span>}
                            </div>
                        </div>
                        {/* Tail Files */}
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /></svg>
                                <span className="font-bold text-purple-900">TAIL FILES</span>
                            </div>
                            {/* Geometry */}
                            <div className="bg-gray-50 rounded-lg border border-gray-200 p-1 mb-1 flex flex-col gap-0 min-h-0">
                                <span className="text-xs text-gray-500 leading-tight">Geometry</span>
                                <span className="font-mono text-gray-900 text-sm leading-tight">{uploadedFiles.tail_GEO || <span className="text-gray-400 italic">Not uploaded</span>}</span>
                                <span className="text-xs text-gray-400 leading-tight">GEO Format</span>
                                {uploadedFiles.tail_GEO && <span className="ml-auto text-green-600"><svg className="w-4 h-4 inline" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg></span>}
                            </div>
                            {/* Mapping */}
                            <div className="bg-gray-50 rounded-lg border border-gray-200 p-1 mb-1 flex flex-col gap-0 min-h-0">
                                <span className="text-xs text-gray-500 leading-tight">Mapping</span>
                                <span className="font-mono text-gray-900 text-sm leading-tight">{uploadedFiles.tail_MAP || <span className="text-gray-400 italic">Not uploaded</span>}</span>
                                <span className="text-xs text-gray-400 leading-tight">MAP Format</span>
                                {uploadedFiles.tail_MAP && <span className="ml-auto text-green-600"><svg className="w-4 h-4 inline" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg></span>}
                            </div>
                            {/* Flow File */}
                            <div className="bg-gray-50 rounded-lg border border-gray-200 p-1 mb-1 flex flex-col gap-0 min-h-0">
                                <span className="text-xs text-gray-500 leading-tight">Flow File</span>
                                <span className="font-mono text-gray-900 text-sm leading-tight">{uploadedFiles.tail_DAT || <span className="text-gray-400 italic">Not uploaded</span>}</span>
                                <span className="text-xs text-gray-400 leading-tight">FLOW Format</span>
                                {uploadedFiles.tail_DAT && <span className="ml-auto text-green-600"><svg className="w-4 h-4 inline" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg></span>}
                            </div>
                        </div>
                        {/* Additional Bodies */}
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4" /></svg>
                                <span className="font-bold text-orange-900">ADDITIONAL BODIES</span>
                            </div>
                            {bodyFiles.length === 0 && (
                                <div className="bg-gray-50 rounded-lg border border-gray-200 p-1 mb-1 flex flex-col gap-0 min-h-0">
                                    <span className="text-xs text-gray-500 leading-tight">No additional bodies uploaded</span>
                                </div>
                            )}
                            {bodyFiles.map((file, idx) => (
                                <div key={file.key} className="bg-gray-50 rounded-lg border border-gray-200 p-1 mb-1 flex flex-col gap-0 min-h-0">
                                    <span className="text-xs text-gray-500 leading-tight">{file.label}</span>
                                    <span className="font-mono text-gray-900 text-sm leading-tight">{file.file || <span className="text-gray-400 italic">Not uploaded</span>}</span>
                                    <span className="text-xs text-gray-400 leading-tight">{file.format} Format</span>
                                    {file.file && <span className="ml-auto text-green-600"><svg className="w-4 h-4 inline" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg></span>}
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
                                <div className="text-blue-900 text-lg">All configurations verified and ready for solver execution</div>
                            </div>
                        </div>
                        <div className="flex flex-row w-full px-10 mb-6 gap-4">
                            {launchSummary.map((item, idx) => (
                                <div key={idx} className="bg-blue-200/40 rounded-xl p-6 flex flex-col items-start w-full min-w-[180px]">
                                    <div className="flex items-center mb-2">{item.icon}<span className="text-blue-900 font-semibold">{item.label}</span></div>
                                    <div className="text-blue-900 text-2xl font-bold">{item.label === "FLOW CONDITIONS" ? (
                                        <span className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                checked={flowVerified}
                                                onChange={() => setFlowVerified(v => !v)}
                                                className="accent-blue-600 w-5 h-5"
                                                id="flow-verify"
                                            />
                                            <label htmlFor="flow-verify" className="cursor-pointer select-none">Verified</label>
                                        </span>
                                    ) : item.value}</div>
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-4 w-full justify-end px-10 pb-8">
                            <button
                                className="px-7 py-3 bg-white text-blue-700 rounded-xl font-semibold text-lg flex items-center gap-2 shadow hover:bg-blue-50"
                                onClick={() => navigate("/run-solver")}
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
                                disabled={!flowVerified}
                            >
                                Launch Simulation
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" /></svg>
                            </button>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
};

export default Solver;

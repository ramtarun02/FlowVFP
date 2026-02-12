import React, { useState, useEffect, useContext, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { fetchAPI } from "../utils/fetch";
import { VfpDataContext } from "./vfpDataContext";

// Helpers to avoid recreating default shapes
const baseFormData = {
  simName: "",
  mach: "",
  aoa: "",
  reynolds: "",
  continuationRun: false,
  wingDumpName: "",
  tailDumpName: "",
  uploadId: "",
  continuationSplitKey: "",
  continuationSplitFile: "",
  excrescence: false,
  autoRunner: false,
  autoStepSize: "",
  autoMode: "aoa",
  autoEndAoA: "",
  autoEndMach: "",
  continuationSelections: []
};

const baseInputFiles = () => ({
  wingConfig: { fileNames: { GeoFile: "", MapFile: "", DatFile: "" }, fileData: {} },
  tailConfig: { fileNames: { GeoFile: "", MapFile: "", DatFile: "" }, fileData: {} },
  bodyFiles: { fileNames: [], fileData: {} }
});

const normalizeVfpPayload = (parsed) => {
  const normalizeSection = (sectionName) => {
    const section = parsed?.inputFiles?.[sectionName] || {};
    const fileNames = section.fileNames || {};
    return {
      fileNames: {
        GeoFile: "",
        MapFile: "",
        DatFile: "",
        ...fileNames
      },
      fileData: section.fileData || {}
    };
  };

  const normalizedInput = {
    wingConfig: normalizeSection("wingConfig"),
    tailConfig: normalizeSection("tailConfig"),
    bodyFiles: {
      fileNames: Array.isArray(parsed?.inputFiles?.bodyFiles?.fileNames) ? parsed.inputFiles.bodyFiles.fileNames : [],
      fileData: parsed?.inputFiles?.bodyFiles?.fileData || {}
    }
  };

  const mergedForm = { ...baseFormData, ...(parsed?.formData || {}) };
  const resultsNode = parsed?.results || parsed?.output || parsed?.analysis || parsed?.resultsSection || null;

  return { mergedForm, normalizedInput, resultsNode };
};

function RunSolver() {
  const { vfpData, setVfpData } = useContext(VfpDataContext);
  const [incomplete, setIncomplete] = useState(false);
  const [warningMsg, setWarningMsg] = useState("");
  const [continuationKeys, setContinuationKeys] = useState([]);
  const [continuationDropdownOpen, setContinuationDropdownOpen] = useState(false);
  const [uploadedCaseName, setUploadedCaseName] = useState("");
  const [continuationKeyToFile, setContinuationKeyToFile] = useState({});
  const navigate = useNavigate();
  const importInputRef = useRef();

  // Helpers
  const hasFiles = filesObj => Object.values(filesObj.fileNames).some(name => !!name);

  // Validation for incomplete config and warning logic
  useEffect(() => {
    const wingPresent = hasFiles(vfpData.inputFiles.wingConfig);
    const tailPresent = hasFiles(vfpData.inputFiles.tailConfig);
    const bodyPresent = vfpData.inputFiles.bodyFiles.fileNames.length > 0;

    if (tailPresent && !bodyPresent) {
      setIncomplete(true);
      setWarningMsg("For a Wing/Tail simulation, you must also upload at least one Additional Body/Spec File.");
    } else if (tailPresent && bodyPresent) {
      setIncomplete(false);
      setWarningMsg("You are attempting a run WING/Tail Simulation.");
    } else {
      setWarningMsg("");
      setIncomplete(!wingPresent);
    }
  }, [vfpData]);

  // File input handlers
  const handleFile = async (section, type, file) => {
    if (!file) {
      setVfpData(prev => ({
        ...prev,
        inputFiles: {
          ...prev.inputFiles,
          [section]: {
            ...prev.inputFiles[section],
            fileNames: { ...prev.inputFiles[section].fileNames, [type]: "" },
            fileData: { ...prev.inputFiles[section].fileData, [prev.inputFiles[section].fileNames[type]]: undefined },
          },
        },
      }));
      return;
    }

    const text = await file.text();
    setVfpData(prev => ({
      ...prev,
      inputFiles: {
        ...prev.inputFiles,
        [section]: {
          ...prev.inputFiles[section],
          fileNames: { ...prev.inputFiles[section].fileNames, [type]: file.name },
          fileData: { ...prev.inputFiles[section].fileData, [file.name]: text },
        },
      },
    }));
  };

  const handleBodyFile = async (file) => {
    if (!file) return;
    const text = await file.text();
    setVfpData(prev => ({
      ...prev,
      inputFiles: {
        ...prev.inputFiles,
        bodyFiles: {
          fileNames: [...prev.inputFiles.bodyFiles.fileNames, file.name],
          fileData: { ...prev.inputFiles.bodyFiles.fileData, [file.name]: text },
        },
      },
    }));
  };

  const removeBodyFile = idx => {
    setVfpData(prev => {
      const names = [...prev.inputFiles.bodyFiles.fileNames];
      const name = names[idx];
      names.splice(idx, 1);
      const fileData = { ...prev.inputFiles.bodyFiles.fileData };
      delete fileData[name];
      return {
        ...prev,
        inputFiles: {
          ...prev.inputFiles,
          bodyFiles: { fileNames: names, fileData },
        },
      };
    });
  };

  // Form field handlers
  const handleFormField = (field, value) => {
    setVfpData(prev => {
      const nextForm = { ...prev.formData, [field]: value };
      if (field === "continuationRun" && !value) {
        nextForm.continuationSplitKey = "";
        nextForm.continuationSplitFile = "";
      }
      return { ...prev, formData: nextForm };
    });
    if (field === "continuationRun" && !value) {
      setContinuationDropdownOpen(false);
    }
  };

  const handleContinuationSelection = (key) => {
    const nextKey = vfpData.formData.continuationSplitKey === key ? "" : key;
    const nextFile = nextKey ? continuationKeyToFile[nextKey] || "" : "";
    setVfpData(prev => ({
      ...prev,
      formData: { ...prev.formData, continuationSplitKey: nextKey, continuationSplitFile: nextFile }
    }));
    setContinuationDropdownOpen(false);
  };

  // Save Draft handler
  const handleSaveDraft = () => {
    const blob = new Blob([JSON.stringify(vfpData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const now = new Date();
    const pad = n => n.toString().padStart(2, "0");
    const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    a.download = vfpData.formData.simName
      ? vfpData.formData.simName + ".vfp"
      : `draft-${dateStr}.vfp`;
    a.href = url;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Import VFP case handler
  const handleImportVFP = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const formData = new FormData();
      formData.append("file", file);

      const uploadResp = await fetchAPI("/upload_vfp", {
        method: "POST",
        body: formData
      });

      const data = await uploadResp.json();

      if (!uploadResp.ok) {
        throw new Error(data?.message || "Upload failed");
      }

      const parsedMain = typeof data?.main === "string" ? JSON.parse(data.main) : (data?.main || {});
      const manifest = data?.manifest || {};
      const keyFileMap = {};
      (manifest?.splitNodes || []).forEach(node => {
        if (node?.key) keyFileMap[node.key] = node.file || "";
      });
      const splitKeys = Array.isArray(manifest?.splitNodes)
        ? manifest.splitNodes.map(node => node?.key).filter(Boolean)
        : [];

      const { mergedForm, normalizedInput } = normalizeVfpPayload(parsedMain);

      setContinuationKeys(splitKeys);
      setContinuationKeyToFile(keyFileMap);
      setContinuationDropdownOpen(false);
      setUploadedCaseName(data?.uploadedFileName || file.name);

      setVfpData(prev => ({
        ...prev,
        formData: {
          ...mergedForm,
          uploadId: data?.uploadId || "",
          continuationSplitKey: "",
          continuationSplitFile: ""
        },
        inputFiles: normalizedInput
      }));
    } catch (err) {
      console.error("Import error:", err);
      alert(err?.message || "Failed to import file. Invalid JSON or unsupported format.");
    } finally {
      e.target.value = "";
    }
  };

  const handleReset = () => {
    setVfpData({
      formData: { ...baseFormData },
      inputFiles: baseInputFiles()
    });
    setContinuationKeys([]);
    setContinuationKeyToFile({});
    setContinuationDropdownOpen(false);
    setUploadedCaseName("");
  };

  // Submit handler: send vfpData JSON to backend
  const handleSubmit = async () => {
    const continuationSelections =
      vfpData.formData.continuationRun && vfpData.formData.continuationSplitKey
        ? [vfpData.formData.continuationSplitKey]
        : [];

    const payload = {
      ...vfpData,
      formData: {
        ...vfpData.formData,
        continuationSelections
      }
    };

    console.log("Submitting VFP data:", payload);
    try {
      const response = await fetchAPI("/start-vfp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await response.json();
      navigate("/results");
    } catch (error) {
      console.error("Error submitting form:", error);
    }
  };

  // Helper: is this a wing+tail simulation?
  const isWingTailSim = () => {
    const tailPresent = hasFiles(vfpData.inputFiles.tailConfig);
    const bodyPresent = vfpData.inputFiles.bodyFiles.fileNames.length > 0;
    return tailPresent && bodyPresent;
  };

  // FileRow and BodyFileRow as before, but use vfpData
  const FileRow = ({ label, desc, icon, section, type, accept }) => {
    const fileName = vfpData.inputFiles[section].fileNames[type];
    return (
      <div className={`flex items-center justify-between rounded-lg border ${fileName ? "bg-green-50 border-green-200" : "border-gray-200"} px-4 py-3 mb-3`}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">{icon}</span>
          <div>
            <div className="font-semibold text-gray-900 text-sm">{label}</div>
            <div className="text-xs text-gray-500">{desc}</div>
            {fileName && <div className="text-xs text-green-700 mt-1">{fileName}</div>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!fileName && (
            <label className="inline-flex items-center cursor-pointer">
              <input
                type="file"
                className="hidden"
                accept={accept}
                onChange={e => {
                  if (e.target.files[0]) handleFile(section, type, e.target.files[0]);
                  e.target.value = "";
                }}
              />
              <span className="inline-flex items-center px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg font-semibold text-xs border border-blue-200 hover:bg-blue-100 transition">
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 9l5-5 5 5M12 4.998V16" /></svg>
                Upload
              </span>
            </label>
          )}
          {fileName && (
            <>
              <span className="text-green-700 font-semibold text-xs flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>
                Uploaded
              </span>
              <button
                className="text-gray-400 hover:text-blue-600"
                title="Replace"
                onClick={() => handleFile(section, type, null)}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 4v16h16V4H4zm4 8h8" /></svg>
              </button>
              <button
                className="text-gray-400 hover:text-red-600"
                title="Remove"
                onClick={() => handleFile(section, type, null)}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  const BodyFileRow = ({ fileName, onRemove }) => (
    <div className="flex items-center justify-between rounded-lg border bg-green-50 border-green-200 px-4 py-3 mb-3">
      <div className="flex items-center gap-3">
        <span className="text-2xl">
          <svg className="w-6 h-6 text-green-700" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M2 12l9 4 9-4-9-4-9 4z" /><path d="M2 12l9 4 9-4" /></svg>
        </span>
        <div>
          <div className="font-semibold text-gray-900 text-sm">Tail Spec</div>
          <div className="text-xs text-green-700 mt-1">{fileName}</div>
        </div>
      </div>
      <button
        className="text-gray-400 hover:text-red-600"
        title="Remove"
        onClick={onRemove}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    </div>
  );

  // Main render
  return (
    <div className="min-h-screen bg-[#fafbfc] font-sans">
      {/* ...header and stepper unchanged... */}
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
              <img src="/VFP-2025/cranfield-logo.svg" alt="Dr. DDP" className="w-9 h-9 rounded-full border" />
              <span className="text-base text-gray-800 font-semibold">Dr. Davide</span>
            </div>
          </div>
        </div>
      </header>
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-8 py-4">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-blue-600 text-white w-8 h-8 flex items-center justify-center font-bold text-lg">1</span>
              <span className="font-semibold text-blue-700 text-lg">Solver Setup</span>
            </div>
            <span className="text-gray-300 text-2xl">—</span>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-gray-300 text-gray-400 w-8 h-8 flex items-center justify-center font-bold text-lg">2</span>
              <span className="font-semibold text-gray-400 text-lg">Review & Launch</span>
            </div>
          </div>
          <button
            className="text-gray-500 hover:text-blue-700 font-medium flex items-center gap-2"
            onClick={() => navigate("/")}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" /></svg>
            <span className="underline">Back to Main Module</span>
          </button>
        </div>
      </div>
      <main className="max-w-7xl mx-auto px-8 py-8">
        <div className="flex flex-col md:flex-row gap-8">
          {/* LEFT: FILE UPLOADS */}
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Configure Multi-Body Simulation</h1>
            <div className="text-gray-500 mb-7 text-lg">Upload configuration files and set flow conditions for your CFD analysis</div>
            {/* Wing Config */}
            <section className="mb-6">
              <div className="rounded-2xl overflow-hidden shadow border border-blue-200 bg-blue-50">
                <div className="flex items-center gap-3 px-6 py-4">
                  <span className="ml-auto text-xs font-bold text-blue-700 bg-blue-100 rounded px-2 py-0.5 flex items-center gap-1">
                    Required
                  </span>
                </div>
                <div className="bg-white px-6 py-5">
                  <FileRow
                    label="GEO File"
                    desc="Geometry definition"
                    icon={<svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>}
                    section="wingConfig"
                    type="GeoFile"
                    accept=".geo"
                  />
                  <FileRow
                    label="MAP File"
                    desc="Surface mapping data"
                    icon={<svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 7h10v10H7z" /></svg>}
                    section="wingConfig"
                    type="MapFile"
                    accept=".map"
                  />
                  <FileRow
                    label="DAT File"
                    desc="Airfoil data"
                    icon={<svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 8h8v8H8z" /></svg>}
                    section="wingConfig"
                    type="DatFile"
                    accept=".dat"
                  />
                </div>
              </div>
            </section>
            {/* Tail Config */}
            <section className="mb-6">
              <div className="rounded-2xl overflow-hidden shadow border border-purple-200 bg-purple-50">
                <div className="flex items-center gap-3 px-6 py-4">
                  <span className="ml-auto text-xs font-bold text-purple-700 bg-purple-100 rounded px-2 py-0.5 flex items-center gap-1">
                    Optional
                  </span>
                </div>
                <div className="bg-white px-6 py-5">
                  <FileRow
                    label="GEO File"
                    desc="Geometry definition"
                    icon={<svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>}
                    section="tailConfig"
                    type="GeoFile"
                    accept=".geo"
                  />
                  <FileRow
                    label="MAP File"
                    desc="Surface mapping data"
                    icon={<svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 7h10v10H7z" /></svg>}
                    section="tailConfig"
                    type="MapFile"
                    accept=".map"
                  />
                  <FileRow
                    label="DAT File"
                    desc="Airfoil data"
                    icon={<svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 8h8v8H8z" /></svg>}
                    section="tailConfig"
                    type="DatFile"
                    accept=".dat"
                  />
                </div>
              </div>
            </section>
            {/* Additional Bodies */}
            <section className="mb-6">
              <div className="rounded-2xl overflow-hidden shadow border border-green-200 bg-green-50">
                <div className="flex items-center gap-3 px-6 py-4">
                  <span className="ml-auto text-xs font-bold text-green-700 bg-green-100 rounded px-2 py-0.5 flex items-center gap-1">
                    Optional
                  </span>
                </div>
                <div className="bg-white px-6 py-5">
                  {vfpData.inputFiles.bodyFiles.fileNames.map((name, i) => (
                    <BodyFileRow key={i} fileName={name} onRemove={() => removeBodyFile(i)} />
                  ))}
                  <label className="inline-flex items-center cursor-pointer mt-2">
                    <input
                      type="file"
                      className="hidden"
                      accept=".geo,.dat"
                      onChange={e => {
                        if (e.target.files[0]) handleBodyFile(e.target.files[0]);
                        e.target.value = "";
                      }}
                    />
                    <span className="inline-flex items-center px-3 py-1.5 bg-green-50 text-green-700 rounded-lg font-semibold text-xs border border-green-200 hover:bg-green-100 transition">
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4" /></svg>
                      Add Additional Body or Spec File
                    </span>
                  </label>
                </div>
              </div>
            </section>
            <div className="flex items-center gap-2 text-green-600 text-sm mt-4 mb-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
              Auto-save not Enabled
            </div>
          </div>
          {/* RIGHT: FLOW CONDITIONS & RUN OPTIONS */}
          <aside className="w-full md:w-[400px] flex-shrink-0">
            <div className="rounded-2xl shadow border border-gray-200 bg-white mb-6">
              <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100 bg-gray-50">
                <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 21v-7a4 4 0 014-4h8a4 4 0 014 4v7" /><circle cx="12" cy="7" r="4" /></svg>
                <span className="font-semibold text-gray-700 text-lg">Flow Conditions</span>
              </div>
              <div className="p-6 flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1">Simulation Name</label>
                  <input
                    type="text"
                    value={vfpData.formData.simName}
                    onChange={e => handleFormField("simName", e.target.value)}
                    className="w-full px-3 py-2 border rounded text-sm"
                    placeholder="Wing-Tail-Analysis-v3"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold mb-1 flex items-center gap-1">
                    Mach Number
                    <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><circle cx="12" cy="8" r="1" /></svg>
                  </label>
                  <input
                    type="number"
                    value={vfpData.formData.mach}
                    onChange={e => handleFormField("mach", e.target.value)}
                    className="w-full px-3 py-2 border rounded text-sm"
                    placeholder="0.85"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Angle of Attack (°)</label>
                  <input
                    type="number"
                    value={vfpData.formData.aoa}
                    onChange={e => handleFormField("aoa", e.target.value)}
                    className="w-full px-3 py-2 border rounded text-sm"
                    placeholder="5.0"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Reynolds Number</label>
                  <input
                    type="text"
                    value={vfpData.formData.reynolds}
                    onChange={e => handleFormField("reynolds", e.target.value)}
                    className="w-full px-3 py-2 border rounded text-sm"
                    placeholder="1.5e6"
                  />
                </div>
              </div>
            </div>
            <div className="rounded-2xl shadow border border-gray-200 bg-white mb-6">
              <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100 bg-gray-50">
                <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>
                <span className="font-semibold text-gray-700 text-lg">Run Options</span>
              </div>
              <div className="p-6 flex flex-col gap-4">
                {/* Single Continuation Run Checkbox */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!vfpData.formData.continuationRun}
                    onChange={() => handleFormField("continuationRun", !vfpData.formData.continuationRun)}
                    id="continuationRun"
                    className="accent-blue-600"
                  />
                  <label htmlFor="continuationRun" className="text-sm font-medium text-gray-700 flex items-center gap-1">
                    Continuation Run
                    <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><circle cx="12" cy="8" r="1" /></svg>
                  </label>
                </div>
                {vfpData.formData.continuationRun && (
                  <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 flex flex-col gap-3">
                    <div className="font-semibold text-gray-800 text-sm">Provide dump file names</div>
                    <div>
                      <label className="block text-xs font-semibold mb-1">Wing Dump File Name</label>
                      <input
                        type="text"
                        value={vfpData.formData.wingDumpName}
                        onChange={e => handleFormField("wingDumpName", e.target.value)}
                        className="w-full px-3 py-2 border rounded text-sm"
                        placeholder="e.g. wingDump.dat"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1">Tail Dump File Name</label>
                      <input
                        type="text"
                        value={vfpData.formData.tailDumpName}
                        onChange={e => handleFormField("tailDumpName", e.target.value)}
                        className="w-full px-3 py-2 border rounded text-sm"
                        placeholder="e.g. tailDump.dat"
                      />
                    </div>
                    <div className="text-xs text-gray-600">Specify the dump files to restart from; import is not required.</div>
                    {continuationKeys.length > 0 && (
                      <div className="border border-blue-100 rounded-lg bg-white/50 p-3 mt-2">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-semibold text-gray-800">Continuation source</div>
                          <button
                            type="button"
                            className="text-xs text-blue-700 hover:text-blue-900 font-semibold"
                            onClick={() => setContinuationDropdownOpen(open => !open)}
                          >
                            {continuationDropdownOpen ? "Hide" : "Select"}
                          </button>
                        </div>
                        {uploadedCaseName && (
                          <div className="text-xs text-gray-600 mt-1">Imported: {uploadedCaseName}</div>
                        )}
                        {continuationDropdownOpen && (
                          <div className="mt-3 border border-blue-100 rounded-lg bg-white divide-y divide-blue-50">
                            {continuationKeys.map(key => {
                              const checked = vfpData.formData.continuationSplitKey === key;
                              return (
                                <label
                                  key={key}
                                  className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-blue-50"
                                >
                                  <input
                                    type="checkbox"
                                    className="accent-blue-600"
                                    checked={checked}
                                    onChange={() => handleContinuationSelection(key)}
                                  />
                                  <span className="text-gray-800">{key}</span>
                                  {checked && (
                                    <span className="ml-auto text-green-600 text-xs font-semibold flex items-center gap-1">
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>
                                      Selected
                                    </span>
                                  )}
                                </label>
                              );
                            })}
                          </div>
                        )}
                        <div className="text-[11px] text-gray-500 mt-2">Select a single split node to continue from.</div>
                      </div>
                    )}
                  </div>
                )}
                {/* Excrescence */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={vfpData.formData.excrescence}
                    onChange={() => handleFormField("excrescence", !vfpData.formData.excrescence)}
                    id="excrescence"
                    className="accent-blue-600"
                  />
                  <label htmlFor="excrescence" className="text-sm font-medium text-gray-700 flex items-center gap-1">
                    Excretion Run
                    <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><circle cx="12" cy="8" r="1" /></svg>
                  </label>
                </div>
                {/* Auto Runner */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={vfpData.formData.autoRunner}
                    onChange={() => handleFormField("autoRunner", !vfpData.formData.autoRunner)}
                    id="autoRunner"
                    className="accent-blue-600"
                  />
                  <label htmlFor="autoRunner" className="text-sm font-medium text-gray-700 flex items-center gap-1">
                    Auto Runner
                    <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><circle cx="12" cy="8" r="1" /></svg>
                  </label>
                </div>
                {vfpData.formData.autoRunner && (
                  <div className="mt-2 p-3 rounded-lg bg-blue-50 border border-blue-200 flex flex-col gap-3">
                    <div>
                      <label className="block text-xs font-semibold mb-1">Step Size</label>
                      <input
                        type="number"
                        value={vfpData.formData.autoStepSize}
                        onChange={e => handleFormField("autoStepSize", e.target.value)}
                        className="w-full px-3 py-2 border rounded text-sm"
                        placeholder="e.g. 0.5"
                      />
                    </div>
                    <div className="flex gap-3 items-center">
                      <label className="text-xs font-semibold">Sweep:</label>
                      <select
                        value={vfpData.formData.autoMode}
                        onChange={e => handleFormField("autoMode", e.target.value)}
                        className="px-2 py-1 border rounded text-sm"
                      >
                        <option value="aoa">Angle of Attack</option>
                        <option value="mach">Mach Number</option>
                      </select>
                    </div>
                    {vfpData.formData.autoMode === "aoa" ? (
                      <div>
                        <label className="block text-xs font-semibold mb-1">End Angle of Attack (°)</label>
                        <input
                          type="number"
                          value={vfpData.formData.autoEndAoA}
                          onChange={e => handleFormField("autoEndAoA", e.target.value)}
                          className="w-full px-3 py-2 border rounded text-sm"
                          placeholder="e.g. 10"
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs font-semibold mb-1">End Mach Number</label>
                        <input
                          type="number"
                          value={vfpData.formData.autoEndMach}
                          onChange={e => handleFormField("autoEndMach", e.target.value)}
                          className="w-full px-3 py-2 border rounded text-sm"
                          placeholder="e.g. 1.2"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            {(incomplete || warningMsg) && (
              <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-4 flex items-center gap-3 mb-6">
                <svg className="w-6 h-6 text-yellow-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><circle cx="12" cy="16" r="1" /></svg>
                <div>
                  <div className="font-semibold text-yellow-800">
                    {warningMsg ? warningMsg : "Incomplete Configuration"}
                  </div>
                  {!warningMsg && (
                    <div className="text-yellow-800 text-sm">
                      Upload required files to proceed.
                    </div>
                  )}
                </div>
              </div>
            )}
          </aside>
        </div>
      </main>
      <footer className="fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-8 py-4">
          <div className="flex items-center gap-2 text-green-600 text-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
            Auto-save not Enabled
          </div>
          <div className="flex gap-3">
            <button
              className="px-7 py-3 bg-white border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 text-lg"
              onClick={handleSaveDraft}
            >
              Save Draft
            </button>
            <button
              className="px-7 py-3 bg-white border border-red-300 rounded-lg font-semibold text-red-700 hover:bg-red-50 text-lg"
              onClick={handleReset}
            >
              Reset
            </button>
            <button
              className={`px-7 py-3 rounded-lg font-semibold text-white text-lg flex items-center gap-2 ${incomplete ? "bg-gray-300 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"}`}
              onClick={handleSubmit}
              disabled={incomplete}
            >
              Review Simulation
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        </div>
      </footer>
      <input
        type="file"
        accept=".vfp,application/json"
        ref={importInputRef}
        style={{ display: "none" }}
        onChange={handleImportVFP}
      />
    </div>
  );
}


export default RunSolver;
import React, { useState, useEffect, useContext, useRef } from "react";
import { useNavigate } from "react-router-dom";
import FormDataContext from "../FormDataContext";
import { fetchAPI } from "../../utils/fetch";

function RunSolver() {
  // File states for each section
  const [wingFiles, setWingFiles] = useState({ GEO: null, MAP: null, DAT: null });
  const [tailFiles, setTailFiles] = useState({ GEO: null, MAP: null, DAT: null });
  const [bodyFiles, setBodyFiles] = useState([]); // Array of { name, file }

  // Flow condition states
  const [simName, setSimName] = useState("");
  const [mach, setMach] = useState("");
  const [aoa, setAoA] = useState("");
  const [reynolds, setReynolds] = useState("");

  // Run options
  const [continuation, setContinuation] = useState(false);
  const [dumpName, setDumpName] = useState("");
  const [excrescence, setExcrescence] = useState(false);

  const [autoRunner, setAutoRunner] = useState(false);
  const [autoStepSize, setAutoStepSize] = useState("");
  const [autoEndAoA, setAutoEndAoA] = useState("");
  const [autoEndMach, setAutoEndMach] = useState("");
  const [autoMode, setAutoMode] = useState("aoa");


  // Validation and warning states
  const [incomplete, setIncomplete] = useState(false);
  const [warningMsg, setWarningMsg] = useState("");

  const { setFormData } = useContext(FormDataContext);
  const navigate = useNavigate();

  // Helper to check if any file is present in a config
  const hasFiles = filesObj => Object.values(filesObj).some(f => !!f);

  // Validation for incomplete config and warning logic
  useEffect(() => {
    // Always require at least one wing file
    const wingPresent = hasFiles(wingFiles);

    // Tail and body logic
    const tailPresent = hasFiles(tailFiles);
    const bodyPresent = bodyFiles.length > 0;

    // If tail is present, body must be present
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
  }, [wingFiles, tailFiles, bodyFiles]);

  // File input handlers
  const handleWingFile = (type, file) => setWingFiles(f => ({ ...f, [type]: file }));
  const handleTailFile = (type, file) => setTailFiles(f => ({ ...f, [type]: file }));
  const handleBodyFile = (file) => {
    setBodyFiles(arr => [...arr, { name: file.name, file }]);
  };
  const removeBodyFile = idx => setBodyFiles(arr => arr.filter((_, i) => i !== idx));
  const removeWingFile = type => setWingFiles(f => ({ ...f, [type]: null }));
  const removeTailFile = type => setTailFiles(f => ({ ...f, [type]: null }));

  // Helper to read a File as text (returns a Promise)
  const readFileAsText = (file) =>
    new Promise((resolve, reject) => {
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsText(file);
    });

  // Save Draft handler
  const handleSaveDraft = async () => {
    // Gather all file data
    const wingFileNames = {
      GeoFile: wingFiles.GEO ? wingFiles.GEO.name : "",
      MapFile: wingFiles.MAP ? wingFiles.MAP.name : "",
      DatFile: wingFiles.DAT ? wingFiles.DAT.name : "",
    };
    const tailFileNames = {
      GeoFile: tailFiles.GEO ? tailFiles.GEO.name : "",
      MapFile: tailFiles.MAP ? tailFiles.MAP.name : "",
      DatFile: tailFiles.DAT ? tailFiles.DAT.name : "",
    };
    const bodyFileNames = bodyFiles.map(b => b.name);

    // Read all files as text
    const wingFileData = {};
    if (wingFiles.GEO) wingFileData[wingFiles.GEO.name] = await readFileAsText(wingFiles.GEO);
    if (wingFiles.MAP) wingFileData[wingFiles.MAP.name] = await readFileAsText(wingFiles.MAP);
    if (wingFiles.DAT) wingFileData[wingFiles.DAT.name] = await readFileAsText(wingFiles.DAT);

    const tailFileData = {};
    if (tailFiles.GEO) tailFileData[tailFiles.GEO.name] = await readFileAsText(tailFiles.GEO);
    if (tailFiles.MAP) tailFileData[tailFiles.MAP.name] = await readFileAsText(tailFiles.MAP);
    if (tailFiles.DAT) tailFileData[tailFiles.DAT.name] = await readFileAsText(tailFiles.DAT);

    const bodyFileData = {};
    for (const b of bodyFiles) {
      bodyFileData[b.name] = await readFileAsText(b.file);
    }

    // Compose the JSON object
    const draft = {
      metadata: {
        createdAt: new Date().toISOString(),
        version: "1.0",
        module: "FlowVFP CFD",
      },
      formData: {
        simName,
        mach,
        aoa,
        reynolds,
        continuation,
        dumpName,
        excrescence,
        autoRunner,
        autoStepSize,
        autoEndAoA,
        autoEndMach,
        autoMode,
      },
      inputFiles: {
        wingConfig: {
          fileNames: wingFileNames,
          fileData: wingFileData,
        },
        tailConfig: {
          fileNames: tailFileNames,
          fileData: tailFileData,
        },
        bodyFiles: {
          fileNames: bodyFileNames,
          fileData: bodyFileData,
        },
      },
    };

    // Download as .vfp file
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    // Format date as YYYYMMDD-HHmmss
    const now = new Date();
    const pad = n => n.toString().padStart(2, "0");
    const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    a.download = simName
      ? simName + ".vfp"
      : `draft-${dateStr}.vfp`;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };


  // Add a ref for the hidden file input
  const importInputRef = useRef();

  // Helper to create a File object from name and content
  const createFile = (name, content) => {
    try {
      return new File([content], name, { type: "text/plain" });
    } catch {
      // For older browsers
      const blob = new Blob([content], { type: "text/plain" });
      blob.lastModifiedDate = new Date();
      blob.name = name;
      return blob;
    }
  };

  // Handler for importing a VFP case
  const handleImportVFP = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Populate form fields
      const fd = data.formData || {};
      setSimName(fd.simName || "");
      setMach(fd.mach || "");
      setAoA(fd.aoa || "");
      setReynolds(fd.reynolds || "");
      setContinuation(!!fd.continuation);
      setDumpName(fd.dumpName || "");
      setExcrescence(!!fd.excrescence);
      setAutoRunner(!!fd.autoRunner);
      setAutoStepSize(fd.autoStepSize || "");
      setAutoEndAoA(fd.autoEndAoA || "");
      setAutoEndMach(fd.autoEndMach || "");
      setAutoMode(fd.autoMode || "aoa");

      // Populate files
      const inputFiles = data.inputFiles || {};
      // Wing files
      const wingCfg = inputFiles.wingConfig || {};
      const wingNames = wingCfg.fileNames || {};
      const wingData = wingCfg.fileData || {};
      setWingFiles({
        GEO: wingNames.GeoFile && wingData[wingNames.GeoFile]
          ? createFile(wingNames.GeoFile, wingData[wingNames.GeoFile])
          : null,
        MAP: wingNames.MapFile && wingData[wingNames.MapFile]
          ? createFile(wingNames.MapFile, wingData[wingNames.MapFile])
          : null,
        DAT: wingNames.DatFile && wingData[wingNames.DatFile]
          ? createFile(wingNames.DatFile, wingData[wingNames.DatFile])
          : null,
      });

      // Tail files
      const tailCfg = inputFiles.tailConfig || {};
      const tailNames = tailCfg.fileNames || {};
      const tailData = tailCfg.fileData || {};
      setTailFiles({
        GEO: tailNames.GeoFile && tailData[tailNames.GeoFile]
          ? createFile(tailNames.GeoFile, tailData[tailNames.GeoFile])
          : null,
        MAP: tailNames.MapFile && tailData[tailNames.MapFile]
          ? createFile(tailNames.MapFile, tailData[tailNames.MapFile])
          : null,
        DAT: tailNames.DatFile && tailData[tailNames.DatFile]
          ? createFile(tailNames.DatFile, tailData[tailNames.DatFile])
          : null,
      });

      // Body files
      const bodyCfg = inputFiles.bodyFiles || {};
      const bodyNames = bodyCfg.fileNames || [];
      const bodyData = bodyCfg.fileData || {};
      setBodyFiles(
        bodyNames
          .filter(name => !!bodyData[name])
          .map(name => ({
            name,
            file: createFile(name, bodyData[name]),
          }))
      );
    } catch (err) {
      alert("Failed to import VFP case: " + err.message);
    } finally {
      e.target.value = "";
    }
  };

  // Submit handler
  const handleSubmit = async () => {
    try {
      const formData = new FormData();

      // Always append wing files if present
      Object.entries(wingFiles).forEach(([type, file]) => file && formData.append(`wing_${type}`, file));

      // If tail files are present, append tail and body files separately
      if (hasFiles(tailFiles)) {
        Object.entries(tailFiles).forEach(([type, file]) => file && formData.append(`tail_${type}`, file));
        bodyFiles.forEach((b, idx) => formData.append(`tail_${idx}`, b.file));
      } else {
        // If only wing simulation, append body files if present (optional)
        bodyFiles.forEach((b, idx) => formData.append(`tail_${idx}`, b.file));
      }

      // Append text fields
      formData.append("simName", simName);
      formData.append("mach", mach);
      formData.append("aoa", aoa);
      formData.append("reynolds", reynolds);
      formData.append("continuation", continuation);
      formData.append("dumpName", dumpName);
      formData.append("excrescence", excrescence);
      formData.append("bodyFiles", JSON.stringify(bodyFiles.map(b => b.name)));

      // Auto Runner options
      formData.append("autoRunner", autoRunner);
      if (autoRunner) {
        formData.append("autoStepSize", autoStepSize);
        if (autoMode === "aoa") {
          formData.append("autoEndAoA", autoEndAoA);
        } else {
          formData.append("autoEndMach", autoEndMach);
        }
        formData.append("autoMode", autoMode);
      }

      // Add additional parameters with file names
      // Wing files
      formData.append("wing_GEO", wingFiles.GEO ? wingFiles.GEO.name : "");
      formData.append("wing_MAP", wingFiles.MAP ? wingFiles.MAP.name : "");
      formData.append("wing_DAT", wingFiles.DAT ? wingFiles.DAT.name : "");
      // Tail files
      formData.append("tail_GEO", tailFiles.GEO ? tailFiles.GEO.name : "");
      formData.append("tail_MAP", tailFiles.MAP ? tailFiles.MAP.name : "");
      formData.append("tail_DAT", tailFiles.DAT ? tailFiles.DAT.name : "");
      // First body file as tail_0 (if present)
      formData.append("tail_0", bodyFiles[0] ? bodyFiles[0].name : "");

      setFormData(formData);

      const response = await fetchAPI("/start-vfp", {
        method: "POST",
        body: formData,
      });
      const result = await response.json();
      navigate("/results", { state: { result } });
    } catch (error) {
      console.error("Error submitting form:", error);
    }
  };

  // File row component
  const FileRow = ({ label, desc, icon, file, onFile, onRemove, accept }) => (
    <div className={`flex items-center justify-between rounded-lg border ${file ? "bg-green-50 border-green-200" : "border-gray-200"} px-4 py-3 mb-3`}>
      <div className="flex items-center gap-3">
        <span className="text-2xl">{icon}</span>
        <div>
          <div className="font-semibold text-gray-900 text-sm">{label}</div>
          <div className="text-xs text-gray-500">{desc}</div>
          {file && <div className="text-xs text-green-700 mt-1">{file.name}</div>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {!file && (
          <>
            <label className="inline-flex items-center cursor-pointer">
              <input
                type="file"
                className="hidden"
                accept={accept}
                onChange={e => {
                  if (e.target.files[0]) onFile(e.target.files[0]);
                  e.target.value = "";
                }}
              />
              <span className="inline-flex items-center px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg font-semibold text-xs border border-blue-200 hover:bg-blue-100 transition">
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 9l5-5 5 5M12 4.998V16" /></svg>
                Upload
              </span>
            </label>
          </>
        )}
        {file && (
          <>
            <span className="text-green-700 font-semibold text-xs flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>
              Uploaded
            </span>
            <button
              className="text-gray-400 hover:text-blue-600"
              title="Replace"
              onClick={() => onFile(null)}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 4v16h16V4H4zm4 8h8" /></svg>
            </button>
            <button
              className="text-gray-400 hover:text-red-600"
              title="Remove"
              onClick={onRemove}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </>
        )}
      </div>
    </div>
  );

  // Body file row
  const BodyFileRow = ({ file, onRemove }) => (
    <div className="flex items-center justify-between rounded-lg border bg-green-50 border-green-200 px-4 py-3 mb-3">
      <div className="flex items-center gap-3">
        <span className="text-2xl">
          <svg className="w-6 h-6 text-green-700" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M2 12l9 4 9-4-9-4-9 4z" /><path d="M2 12l9 4 9-4" /></svg>
        </span>
        <div>
          <div className="font-semibold text-gray-900 text-sm">Tail Spec</div>
          <div className="text-xs text-green-700 mt-1">{file.name}</div>
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
      {/* HEADER */}
      <header className="bg-white border-b border-gray-200" style={{ boxShadow: "0 2px 8px 0 rgba(16,30,54,.04)" }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between px-8 py-5">
          <div className="flex items-center gap-3">
            {/* VFP Logo instead of blue icon */}
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
      {/* STEPPER & BACK BUTTON */}
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

      {/* MAIN CONTENT */}
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
                  <span className="bg-blue-600 rounded-lg p-2 flex items-center justify-center">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M2 16l10-8 10 8" /></svg>
                  </span>
                  <div>
                    <div className="font-semibold text-blue-900 text-lg">Wing Configuration Files</div>
                    <div className="text-xs text-blue-900">Primary aerodynamic surface</div>
                  </div>
                  <span className="ml-auto text-xs font-bold text-blue-700 bg-blue-100 rounded px-2 py-0.5 flex items-center gap-1">
                    Required
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><circle cx="12" cy="8" r="1" /></svg>
                  </span>
                </div>
                <div className="bg-white px-6 py-5">
                  <FileRow
                    label="GEO File"
                    desc="Geometry definition"
                    icon={<svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>}
                    file={wingFiles.GEO}
                    onFile={f => handleWingFile("GEO", f)}
                    onRemove={() => removeWingFile("GEO")}
                    accept=".geo"
                  />
                  <FileRow
                    label="MAP File"
                    desc="Surface mapping data"
                    icon={<svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 7h10v10H7z" /></svg>}
                    file={wingFiles.MAP}
                    onFile={f => handleWingFile("MAP", f)}
                    onRemove={() => removeWingFile("MAP")}
                    accept=".map"
                  />
                  <FileRow
                    label="DAT File"
                    desc="Airfoil data"
                    icon={<svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 8h8v8H8z" /></svg>}
                    file={wingFiles.DAT}
                    onFile={f => handleWingFile("DAT", f)}
                    onRemove={() => removeWingFile("DAT")}
                    accept=".dat"
                  />
                </div>
              </div>
            </section>

            {/* Tail Config */}
            <section className="mb-6">
              <div className="rounded-2xl overflow-hidden shadow border border-purple-200 bg-purple-50">
                <div className="flex items-center gap-3 px-6 py-4">
                  <span className="bg-purple-600 rounded-lg p-2 flex items-center justify-center">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M2 16l10-8 10 8" /></svg>
                  </span>
                  <div>
                    <div className="font-semibold text-purple-900 text-lg">Tail Configuration Files</div>
                    <div className="text-xs text-purple-900">Stabilizer and control surfaces</div>
                  </div>
                  <span className="ml-auto text-xs font-bold text-purple-700 bg-purple-100 rounded px-2 py-0.5 flex items-center gap-1">
                    Optional
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><circle cx="12" cy="8" r="1" /></svg>
                  </span>
                </div>
                <div className="bg-white px-6 py-5">
                  <FileRow
                    label="GEO File"
                    desc="Geometry definition"
                    icon={<svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>}
                    file={tailFiles.GEO}
                    onFile={f => handleTailFile("GEO", f)}
                    onRemove={() => removeTailFile("GEO")}
                    accept=".geo"
                  />
                  <FileRow
                    label="MAP File"
                    desc="Surface mapping data"
                    icon={<svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 7h10v10H7z" /></svg>}
                    file={tailFiles.MAP}
                    onFile={f => handleTailFile("MAP", f)}
                    onRemove={() => removeTailFile("MAP")}
                    accept=".map"
                  />
                  <FileRow
                    label="DAT File"
                    desc="Airfoil data"
                    icon={<svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 8h8v8H8z" /></svg>}
                    file={tailFiles.DAT}
                    onFile={f => handleTailFile("DAT", f)}
                    onRemove={() => removeTailFile("DAT")}
                    accept=".dat"
                  />
                </div>
              </div>
            </section>

            {/* Additional Bodies */}
            <section className="mb-6">
              <div className="rounded-2xl overflow-hidden shadow border border-green-200 bg-green-50">
                <div className="flex items-center gap-3 px-6 py-4">
                  <span className="bg-green-600 rounded-lg p-2 flex items-center justify-center">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M2 16l10-8 10 8" /></svg>
                  </span>
                  <div>
                    <div className="font-semibold text-green-900 text-lg">Additional Bodies / Spec Files</div>
                    <div className="text-xs text-green-900">Optional components and solver specifications</div>
                  </div>
                  <span className="ml-auto text-xs font-bold text-green-700 bg-green-100 rounded px-2 py-0.5 flex items-center gap-1">
                    Optional
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><circle cx="12" cy="8" r="1" /></svg>
                  </span>
                </div>
                <div className="bg-white px-6 py-5">
                  {bodyFiles.map((b, i) => (
                    <BodyFileRow key={i} file={b} onRemove={() => removeBodyFile(i)} />
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

            {/* Auto-save indicator */}
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
                    value={simName}
                    onChange={e => setSimName(e.target.value)}
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
                    value={mach}
                    onChange={e => setMach(e.target.value)}
                    className="w-full px-3 py-2 border rounded text-sm"
                    placeholder="0.85"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Angle of Attack (°)</label>
                  <input
                    type="number"
                    value={aoa}
                    onChange={e => setAoA(e.target.value)}
                    className="w-full px-3 py-2 border rounded text-sm"
                    placeholder="5.0"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Reynolds Number</label>
                  <input
                    type="text"
                    value={reynolds}
                    onChange={e => setReynolds(e.target.value)}
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
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={continuation}
                    onChange={() => setContinuation(!continuation)}
                    id="continuation"
                    className="accent-blue-600"
                  />
                  <label htmlFor="continuation" className="text-sm font-medium text-gray-700 flex items-center gap-1">
                    Continuation Run
                    <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><circle cx="12" cy="8" r="1" /></svg>
                  </label>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Dump File Name</label>
                  <input
                    type="text"
                    value={dumpName}
                    onChange={e => setDumpName(e.target.value)}
                    className="w-full px-3 py-2 border rounded text-sm"
                    placeholder="Previous simulation dump file"
                    disabled={!continuation}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={excrescence}
                    onChange={() => setExcrescence(!excrescence)}
                    id="excrescence"
                    className="accent-blue-600"
                  />
                  <label htmlFor="excrescence" className="text-sm font-medium text-gray-700 flex items-center gap-1">
                    Excretion Run
                    <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><circle cx="12" cy="8" r="1" /></svg>
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={autoRunner}
                    onChange={() => setAutoRunner(!autoRunner)}
                    id="autoRunner"
                    className="accent-blue-600"
                  />
                  <label htmlFor="autoRunner" className="text-sm font-medium text-gray-700 flex items-center gap-1">
                    Auto Runner
                    <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><circle cx="12" cy="8" r="1" /></svg>
                  </label>
                </div>
                {autoRunner && (
                  <div className="mt-2 p-3 rounded-lg bg-blue-50 border border-blue-200 flex flex-col gap-3">
                    <div>
                      <label className="block text-xs font-semibold mb-1">Step Size</label>
                      <input
                        type="number"
                        value={autoStepSize}
                        onChange={e => setAutoStepSize(e.target.value)}
                        className="w-full px-3 py-2 border rounded text-sm"
                        placeholder="e.g. 0.5"
                      />
                    </div>
                    <div className="flex gap-3 items-center">
                      <label className="text-xs font-semibold">Sweep:</label>
                      <select
                        value={autoMode}
                        onChange={e => setAutoMode(e.target.value)}
                        className="px-2 py-1 border rounded text-sm"
                      >
                        <option value="aoa">Angle of Attack</option>
                        <option value="mach">Mach Number</option>
                      </select>
                    </div>
                    {autoMode === "aoa" ? (
                      <div>
                        <label className="block text-xs font-semibold mb-1">End Angle of Attack (°)</label>
                        <input
                          type="number"
                          value={autoEndAoA}
                          onChange={e => setAutoEndAoA(e.target.value)}
                          className="w-full px-3 py-2 border rounded text-sm"
                          placeholder="e.g. 10"
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs font-semibold mb-1">End Mach Number</label>
                        <input
                          type="number"
                          value={autoEndMach}
                          onChange={e => setAutoEndMach(e.target.value)}
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

      {/* FOOTER BAR */}
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
    </div>
  );
}

export default RunSolver;
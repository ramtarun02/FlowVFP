/**
 * RunSolver.jsx
 * =============
 * Input configuration page for the FlowVFP solver.
 * Collects simulation parameters and input files, stores them in the
 * VfpDataContext, then navigates to /simulation (SimulationRun).
 *
 * Features merged from runSolver.js (legacy):
 *  - Import VFP Case (.vfp archive, with 85 MB server-upload fallback)
 *  - Save Draft (download current state as .vfp JSON)
 *  - Reset all state
 *  - Continuation split-key picker (populated from imported VFP)
 *  - Incomplete-config warning banner
 */

import React, { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useVfpDataContext } from "../store/VfpDataContext";
import { fetchAPI } from "../utils/fetch";
import { vfpStorage, DUMP_EXTS } from "../utils/vfpStorage";
import { streamParseVfpFile } from "../utils/vfpParser";
import VfpDumpSelector from "./VfpDumpSelector";

// ── Helpers ───────────────────────────────────────────────────────────────────

const readFileAsText = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });

// ── VFP import/export helpers (from legacy runSolver.js) ──────────────────────

const FILE_SIZE_THRESHOLD_BYTES = 85 * 1024 * 1024; // 85 MB

const baseFormData = {
  simName: "", mach: "", aoa: "", reynolds: "",
  continuationRun: false, wingDumpName: "", tailDumpName: "",
  uploadId: "", continuationSplitKey: "", continuationSplitFile: "",
  excrescence: false, autoRunner: false, autoStepSize: "",
  autoMode: "aoa", autoEndAoA: "", autoEndMach: "",
  continuationSelections: [],
};

const extractContinuationFromManifest = (manifest = {}) => {
  const keyFileMap = {};
  const keys = Array.isArray(manifest?.splitNodes)
    ? manifest.splitNodes
        .map(node => { if (node?.key) { keyFileMap[node.key] = node.file || ""; return node.key; } return null; })
        .filter(Boolean)
    : [];
  return { keys, map: keyFileMap };
};

const extractContinuationFromResults = (resultsNode = {}) => {
  const gather = (config) => {
    const keys = []; const map = {};
    const flows = config?.flows ?? config?.flowKeys ?? config?.flowkeys ?? config?.flowList ?? config?.flow_list;
    if (Array.isArray(flows)) {
      flows.forEach(flow => {
        if (typeof flow === "string") { keys.push(flow); return; }
        if (flow && typeof flow === "object") {
          const key = flow.key || flow.id || flow.name || flow.flowKey || flow.flow;
          if (key) { keys.push(key); map[key] = flow.file || flow.dumpFile || flow.path || flow.filename || flow.name || ""; }
        }
      });
    } else if (flows && typeof flows === "object") {
      Object.entries(flows).forEach(([key, value]) => {
        if (!key) return; keys.push(key);
        map[key] = typeof value === "string" ? value : (value?.file || value?.dumpFile || value?.path || value?.filename || value?.name || "");
      });
    }
    return { keys, map };
  };
  const wing = gather(resultsNode?.wingConfig);
  const tail = gather(resultsNode?.tailConfig);
  return {
    keys: Array.from(new Set([...(wing.keys || []), ...(tail.keys || [])])),
    map:  { ...(wing.map || {}), ...(tail.map || {}) },
  };
};

const mergeContinuationSources = (manifest, resultsNode) => {
  const fromManifest = extractContinuationFromManifest(manifest);
  const fromResults  = extractContinuationFromResults(resultsNode);
  const map  = { ...(fromResults.map || {}), ...(fromManifest.map || {}) };
  const keys = Array.from(new Set([...(fromManifest.keys || []), ...(fromResults.keys || [])]));
  return { keys, map };
};

// ── VFP results helpers (adapted from JSON-analyser prototype) ───────────────

/**
 * Build flowKeyMeta from the `results` node of a parsed VFP file.
 * Only stores file *names*, never the file data — keeps memory footprint tiny.
 *
 * @returns { [configKey]: { [flowKey]: string[] } }
 */
const buildFlowKeyMeta = (results) => {
  const meta = {};
  const CONFIG_KEYS = ['wingConfig', 'tailConfig'];
  for (const configKey of CONFIG_KEYS) {
    const configResults = results?.[configKey];
    if (!configResults || typeof configResults !== 'object' || Array.isArray(configResults)) continue;
    const flowKeys = {};
    for (const [flowKey, files] of Object.entries(configResults)) {
      if (!files || typeof files !== 'object') continue;
      flowKeys[flowKey] = Object.keys(files);
    }
    if (Object.keys(flowKeys).length > 0) meta[configKey] = flowKeys;
  }
  return meta;
};

const normalizeVfpPayload = (parsed) => {
  const normalizeSection = (sectionName) => {
    const section = parsed?.inputFiles?.[sectionName] || {};
    return {
      fileNames: { GeoFile: "", MapFile: "", DatFile: "", ...(section.fileNames || {}) },
      fileData:  section.fileData || {},
    };
  };
  const normalizedInput = {
    wingConfig: normalizeSection("wingConfig"),
    tailConfig: normalizeSection("tailConfig"),
    bodyFiles: {
      fileNames: Array.isArray(parsed?.inputFiles?.bodyFiles?.fileNames) ? parsed.inputFiles.bodyFiles.fileNames : [],
      fileData:  parsed?.inputFiles?.bodyFiles?.fileData || {},
    },
  };
  const mergedForm  = { ...baseFormData, ...(parsed?.formData || {}) };
  const resultsNode = parsed?.results || parsed?.output || parsed?.analysis || parsed?.resultsSection || null;
  return { mergedForm, normalizedInput, resultsNode };
};

/** Reconstruct a {file, name} entry from stored text content */
const makeFileEntry = (name, content) => ({
  file: new File([content], name, { type: "text/plain" }),
  name,
});

// ── Shared sub-components (defined outside RunSolver to preserve identity) ───

const FileDropZone = ({ label, accept, fileKey, fileName, onFile, hint }) => {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const handle = (file) => {
    if (!file) return;
    onFile(fileKey, file);
  };

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <div
        onClick={() => inputRef.current.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handle(e.dataTransfer.files[0]); }}
        className={`relative border-2 border-dashed rounded-lg p-4 cursor-pointer transition-all duration-200 text-center
          ${dragging ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-blue-400 hover:bg-gray-50"}
          ${fileName ? "border-green-400 bg-green-50" : ""}`}
      >
        {fileName ? (
          <div className="flex items-center justify-center gap-2">
            <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm text-green-700 font-medium truncate max-w-full">{fileName}</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <span className="text-xs text-gray-500">{hint || "Drop or click to upload"}</span>
            <span className="text-xs text-blue-500 font-medium">{accept}</span>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => handle(e.target.files[0])}
        />
      </div>
    </div>
  );
};

const Field = ({ id, label, value, onChange, error, placeholder, type = "text", required }) => (
  <div className="flex flex-col gap-1">
    <label htmlFor={id} className="text-sm font-medium text-gray-700">
      {label}{required && <span className="text-red-500 ml-1">*</span>}
    </label>
    <input
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`px-3 py-2 rounded-lg border text-sm transition-colors
        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
        ${error ? "border-red-400 bg-red-50" : "border-gray-300 bg-white hover:border-gray-400"}`}
    />
    {error && <span className="text-xs text-red-600">{error}</span>}
  </div>
);

const Toggle = ({ id, label, checked, onChange, description }) => (
  <label htmlFor={id} className="flex items-start gap-3 cursor-pointer group">
    <div className="relative mt-0.5">
      <input id={id} type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <div className={`w-10 h-5 rounded-full transition-colors ${checked ? "bg-blue-600" : "bg-gray-300"}`} />
      <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : ""}`} />
    </div>
    <div>
      <p className="text-sm font-medium text-gray-700 group-hover:text-gray-900">{label}</p>
      {description && <p className="text-xs text-gray-500">{description}</p>}
    </div>
  </label>
);

// ── Main Component ────────────────────────────────────────────────────────────

const RunSolver = () => {
  const navigate  = useNavigate();
  const { setVfpData } = useVfpDataContext();

  // ── Form state ──────────────────────────────────────────────────────────────
  const [simName,   setSimName]   = useState("");
  const [mach,      setMach]      = useState("");
  const [aoa,       setAoa]       = useState("");
  const [reynolds,  setReynolds]  = useState("");

  // Options
  const [continuationRun,       setContinuationRun]       = useState(false);
  const [excrescence,           setExcrescence]           = useState(false);
  const [autoRunner,            setAutoRunner]            = useState(false);
  const [autoMode,              setAutoMode]              = useState("aoa");
  const [autoStepSize,          setAutoStepSize]          = useState("");
  const [autoEndAoA,            setAutoEndAoA]            = useState("");
  const [autoEndMach,           setAutoEndMach]           = useState("");
  const [wingDumpName,          setWingDumpName]          = useState("");
  const [tailDumpName,          setTailDumpName]          = useState("");

  // File state — { file: File, name: string }
  const [wingFiles,  setWingFiles]  = useState({ GeoFile: null, MapFile: null, DatFile: null });
  const [tailFiles,  setTailFiles]  = useState({ GeoFile: null, MapFile: null, DatFile: null });
  const [bodyFiles,  setBodyFiles]  = useState([]);       // array of { file, name }
  const [includeTail, setIncludeTail] = useState(false);

  const [isLoading, setIsLoading]  = useState(false);
  const [errors,    setErrors]     = useState({});
  const bodyInputRef = useRef(null);

  // ── Upload / parsing progress state ────────────────────────────────────────
  const [importProgress, setImportProgress] = useState({ percent: 0, stage: '', bytesRead: 0, totalBytes: 0 });
  const [submitProgress, setSubmitProgress] = useState({ percent: 0, stage: '' });

  // ── Continuation / import state (from legacy runSolver.js) ────────────────
  const [continuationKeys,          setContinuationKeys]          = useState([]);
  const [continuationKeyToFile,     setContinuationKeyToFile]     = useState({});
  const [continuationDropdownOpen,  setContinuationDropdownOpen]  = useState(false);
  const [uploadedCaseName,          setUploadedCaseName]          = useState("");
  const [incomplete,                setIncomplete]                = useState(false);
  const [warningMsg,                setWarningMsg]                = useState("");
  const importInputRef = useRef(null);

  // ── JSON-analyser-style local VFP dump selection ──────────────────────────
  // flowKeyMeta holds just the tree skeleton (keys + file names, no data).
  // Actual fort dump bytes are retrieved from IndexedDB on demand.
  const [importedVfpFlowKeys, setImportedVfpFlowKeys] = useState({});
  const [selectedDump,        setSelectedDump]        = useState(null);

  // ── File handlers ──────────────────────────────────────────────────────────

  const handleWingFile = useCallback((key, file) => {
    setWingFiles((prev) => ({ ...prev, [key]: { file, name: file.name } }));
    setErrors((prev) => ({ ...prev, [`wing_${key}`]: null }));
  }, []);

  const handleTailFile = useCallback((key, file) => {
    setTailFiles((prev) => ({ ...prev, [key]: { file, name: file.name } }));
  }, []);

  const handleBodyFiles = (e) => {
    const files = Array.from(e.target.files);
    const newEntries = files.map((f) => ({ file: f, name: f.name }));
    setBodyFiles((prev) => [...prev, ...newEntries]);
  };

  // ── Dump selector callback ─────────────────────────────────────────────────
  /** Called by VfpDumpSelector; fetches fort dump files from IndexedDB. */
  const handleDumpSelect = useCallback(async (selection) => {
    if (!selection) {
      setSelectedDump(null);
      return;
    }
    const { configKey, flowKey } = selection;
    try {
      const files = await vfpStorage.getDumpFiles(configKey, flowKey);
      if (!files || Object.keys(files).length === 0) {
        alert(`No dump files found for "${flowKey}". The VFP may not contain fort files for this flow key.`);
        return;
      }
      setSelectedDump({ configKey, flowKey, files });
    } catch (err) {
      console.error('[RunSolver] getDumpFiles failed:', err);
      alert('Could not load dump files from browser storage. Try re-importing the VFP file.');
    }
  }, []);

  const removeBodyFile = (idx) =>
    setBodyFiles((prev) => prev.filter((_, i) => i !== idx));

  // ── Incomplete-config validation (reactive) ────────────────────────────────
  useEffect(() => {
    const wingPresent = !!(wingFiles.GeoFile || wingFiles.MapFile || wingFiles.DatFile);
    const tailPresent = includeTail && !!(tailFiles.GeoFile || tailFiles.MapFile || tailFiles.DatFile);
    const bodyPresent = bodyFiles.length > 0;
    if (includeTail && tailPresent && !bodyPresent) {
      setIncomplete(true);
      setWarningMsg("For a Wing/Tail simulation you must also upload at least one Body/Spec file.");
    } else if (includeTail && tailPresent && bodyPresent) {
      setIncomplete(false);
      setWarningMsg("You are attempting a Wing/Tail simulation.");
    } else {
      setWarningMsg("");
      setIncomplete(!wingPresent);
    }
  }, [wingFiles, tailFiles, bodyFiles, includeTail]);

  // ── Save Draft ─────────────────────────────────────────────────────────────
  const handleSaveDraft = useCallback(async () => {
    // Read file contents so the draft includes actual file data
    const readEntry = async (entry) => {
      if (!entry?.file) return null;
      try { return await readFileAsText(entry.file); } catch { return null; }
    };

    // Read wing config file data
    const wingFileData = {};
    for (const key of ["GeoFile", "MapFile", "DatFile"]) {
      const entry = wingFiles[key];
      if (entry?.name) {
        const content = await readEntry(entry);
        if (content != null) wingFileData[entry.name] = content;
      }
    }

    // Read tail config file data
    const tailFileData = {};
    for (const key of ["GeoFile", "MapFile", "DatFile"]) {
      const entry = tailFiles[key];
      if (entry?.name) {
        const content = await readEntry(entry);
        if (content != null) tailFileData[entry.name] = content;
      }
    }

    // Read body file data
    const bodyFileData = {};
    for (const entry of bodyFiles) {
      if (entry?.name) {
        const content = await readEntry(entry);
        if (content != null) bodyFileData[entry.name] = content;
      }
    }

    const draft = {
      formData: {
        simName, mach, aoa, reynolds, continuationRun, wingDumpName, tailDumpName,
        excrescence, autoRunner, autoStepSize, autoMode, autoEndAoA, autoEndMach,
        uploadId: "", continuationSplitKey: "", continuationSplitFile: "",
        continuationSelections: [],
      },
      inputFiles: {
        wingConfig: { fileNames: { GeoFile: wingFiles.GeoFile?.name || "", MapFile: wingFiles.MapFile?.name || "", DatFile: wingFiles.DatFile?.name || "" }, fileData: wingFileData },
        tailConfig: { fileNames: { GeoFile: tailFiles.GeoFile?.name || "", MapFile: tailFiles.MapFile?.name || "", DatFile: tailFiles.DatFile?.name || "" }, fileData: tailFileData },
        bodyFiles:  { fileNames: bodyFiles.map(e => e.name), fileData: bodyFileData },
      },
    };
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    const now  = new Date();
    const pad  = n => n.toString().padStart(2, "0");
    const ts   = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    a.download = simName ? `${simName}.vfp` : `draft-${ts}.vfp`;
    a.href = url;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [simName, mach, aoa, reynolds, continuationRun, wingDumpName, tailDumpName,
      excrescence, autoRunner, autoStepSize, autoMode, autoEndAoA, autoEndMach,
      wingFiles, tailFiles, bodyFiles]);

  // ── Import VFP Case ────────────────────────────────────────────────────────
  // Privacy-first: the file is always parsed locally — no server upload.
  // Only the selected dump files (fort11-55, a few KB) are ever sent to the
  // server when the user launches a continuation run.
  const handleImportVFP = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setImportProgress({ percent: 0, stage: 'reading', bytesRead: 0, totalBytes: file.size });
    try {
      // ── 1. Stream-parse locally — no size limit ───────────────────────────
      //    The file is fed in 64 KB chunks; only formData, inputFiles, and
      //    the seven fort dump files (fort11-55) are kept in memory.
      //    Everything else (large CP arrays etc.) is discarded on the fly.
      //    Fort files also go into IndexedDB via vfpStorage (done inside
      //    streamParseVfpFile before it resolves).
      const {
        formData:   streamedFormData,
        inputFiles: streamedInputFiles,
        flowKeyMeta,
      } = await streamParseVfpFile(file, {
        onProgress: (p) => setImportProgress(p),
      });

      // ── 2. Assemble minimal parsed object for normalizeVfpPayload ─────────
      const parsedMain = {
        formData:   streamedFormData   ?? {},
        inputFiles: streamedInputFiles ?? {},
      };
      const { mergedForm, normalizedInput, resultsNode } = normalizeVfpPayload(parsedMain);

      // ── 3. flowKeyMeta already built by streaming parser ──────────────────
      // ── 4. IndexedDB already written by streamParseVfpFile ───────────────

      // ── 5. Populate legacy continuation keys (backward compat) ────────────
      //    resultsNode is null because we didn't materialise the full results.
      //    The new VfpDumpSelector covers flow-key selection instead.
      const { keys, map } = mergeContinuationSources({}, resultsNode);
      setContinuationKeys(keys);
      setContinuationKeyToFile(map);
      setContinuationDropdownOpen(false);

      // ── 6. Update dump-selector state ─────────────────────────────────────
      setImportedVfpFlowKeys(flowKeyMeta);
      setSelectedDump(null);
      setUploadedCaseName(file.name);

      // Populate form fields
      setSimName(mergedForm.simName || "");
      setMach(mergedForm.mach || "");
      setAoa(mergedForm.aoa || "");
      setReynolds(mergedForm.reynolds || "");
      setContinuationRun(!!mergedForm.continuationRun);
      setWingDumpName(mergedForm.wingDumpName || "");
      setTailDumpName(mergedForm.tailDumpName || "");
      setExcrescence(!!mergedForm.excrescence);
      setAutoRunner(!!mergedForm.autoRunner);
      setAutoMode(mergedForm.autoMode || "aoa");
      setAutoStepSize(mergedForm.autoStepSize || "");
      setAutoEndAoA(mergedForm.autoEndAoA || "");
      setAutoEndMach(mergedForm.autoEndMach || "");

      // Reconstruct File objects from stored file data
      const makeEntry = (name, data) => name && data?.[name] ? makeFileEntry(name, data[name]) : null;
      const wfd  = normalizedInput.wingConfig.fileData;
      const wfn  = normalizedInput.wingConfig.fileNames;
      const tfd  = normalizedInput.tailConfig.fileData;
      const tfn  = normalizedInput.tailConfig.fileNames;
      setWingFiles({
        GeoFile: makeEntry(wfn.GeoFile, wfd),
        MapFile: makeEntry(wfn.MapFile, wfd),
        DatFile: makeEntry(wfn.DatFile, wfd),
      });
      const hasTail = !!(tfn.GeoFile || tfn.MapFile || tfn.DatFile);
      setIncludeTail(hasTail);
      setTailFiles({
        GeoFile: makeEntry(tfn.GeoFile, tfd),
        MapFile: makeEntry(tfn.MapFile, tfd),
        DatFile: makeEntry(tfn.DatFile, tfd),
      });
      const bfd = normalizedInput.bodyFiles.fileData;
      setBodyFiles(normalizedInput.bodyFiles.fileNames.map(n => makeEntry(n, bfd)).filter(Boolean));

      setErrors({});
    } catch (err) {
      console.error('[RunSolver] Import error:', err);
      alert(err?.message || 'Failed to import .vfp file. Check it is valid JSON.');
    } finally {
      setIsLoading(false);
      setImportProgress({ percent: 0, stage: '', bytesRead: 0, totalBytes: 0 });
      e.target.value = '';
    }
  };

  // ── Reset ──────────────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    setSimName(''); setMach(''); setAoa(''); setReynolds('');
    setContinuationRun(false); setWingDumpName(''); setTailDumpName('');
    setExcrescence(false); setAutoRunner(false); setAutoMode('aoa');
    setAutoStepSize(''); setAutoEndAoA(''); setAutoEndMach('');
    setWingFiles({ GeoFile: null, MapFile: null, DatFile: null });
    setTailFiles({ GeoFile: null, MapFile: null, DatFile: null });
    setBodyFiles([]); setIncludeTail(false);
    setContinuationKeys([]); setContinuationKeyToFile({});
    setContinuationDropdownOpen(false); setUploadedCaseName('');
    setImportedVfpFlowKeys({}); setSelectedDump(null);
    vfpStorage.clear().catch(() => {});
    setErrors({});
  }, []);

  // ── Continuation key selection ─────────────────────────────────────────────
  const [selectedContinuationKey, setSelectedContinuationKey] = useState("");

  // ── Validation ─────────────────────────────────────────────────────────────
  const validate = () => {
    const e = {};
    if (!simName.trim())       e.simName   = "Simulation name is required";
    if (!mach.trim())          e.mach      = "Mach number is required";
    if (!aoa.trim())           e.aoa       = "Angle of attack is required";
    if (!reynolds.trim())      e.reynolds  = "Reynolds number is required";
    if (!wingFiles.GeoFile)    e.wing_GeoFile = "Wing GEO file is required";
    if (!wingFiles.DatFile)    e.wing_DatFile = "Wing DAT file is required";
    return e;
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationErrors = validate();
    if (Object.keys(validationErrors).length) {
      setErrors(validationErrors);
      return;
    }

    setIsLoading(true);
    setSubmitProgress({ percent: 0, stage: 'reading' });
    try {
      // Read all files as text
      const readConfig = async (fileMap) => {
        const fileNames = {};
        const fileData  = {};
        for (const [key, entry] of Object.entries(fileMap)) {
          if (entry?.file) {
            fileNames[key]           = entry.name;
            fileData[entry.name]     = await readFileAsText(entry.file);
          } else {
            fileNames[key] = "";
          }
        }
        return { fileNames, fileData };
      };

      const wingConfig = await readConfig(wingFiles);
      const tailConfig = includeTail
        ? await readConfig(tailFiles)
        : { fileNames: { GeoFile: "", MapFile: "", DatFile: "" }, fileData: {} };

      const bodyFileNames = [];
      const bodyFileData  = {};
      for (const entry of bodyFiles) {
        bodyFileNames.push(entry.name);
        bodyFileData[entry.name] = await readFileAsText(entry.file);
      }

      setSubmitProgress({ percent: 60, stage: 'building' });
      const vfpPayload = {
        metadata: {
          createdAt: new Date().toISOString(),
          version:   "1.0",
          module:    "FlowVFP CFD",
        },
        formData: {
          simName:                simName.trim(),
          mach:                   mach.trim(),
          aoa:                    aoa.trim(),
          reynolds:               reynolds.trim(),
          continuationRun,
          wingDumpName:           wingDumpName.trim(),
          tailDumpName:           tailDumpName.trim(),
          uploadId:               '',
          continuationSplitKey:   selectedContinuationKey,
          continuationSplitFile:  selectedContinuationKey ? (continuationKeyToFile[selectedContinuationKey] || '') : '',
          excrescence,
          autoRunner,
          autoStepSize:           autoStepSize.trim(),
          autoMode,
          autoEndAoA:             autoEndAoA.trim(),
          autoEndMach:            autoEndMach.trim(),
          continuationSelections: selectedContinuationKey ? [selectedContinuationKey] : [],
          // JSON-analyser-style payload: only the selected dump files travel to the server
          ...(continuationRun && selectedDump ? {
            continuationDumpData: {
              configKey: selectedDump.configKey,
              flowKey:   selectedDump.flowKey,
              files:     selectedDump.files,
            },
          } : {}),
        },
        inputFiles: {
          wingConfig,
          tailConfig,
          bodyFiles: { fileNames: bodyFileNames, fileData: bodyFileData },
        },
        results: null,
      };

      setSubmitProgress({ percent: 90, stage: 'finalizing' });
      setVfpData(vfpPayload);
      setSubmitProgress({ percent: 100, stage: 'complete' });
      navigate("/simulation");
    } catch (err) {
      console.error("Error preparing simulation:", err);
      setErrors({ submit: `Failed to read files: ${err.message}` });
    } finally {
      setIsLoading(false);
      setSubmitProgress({ percent: 0, stage: '' });
    }
  };

  // ── UI Helpers removed — Field and Toggle are now top-level components ───

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <header className="bg-white/95 backdrop-blur-md shadow border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/")}
              className="text-gray-500 hover:text-gray-800 transition-colors p-1 rounded-lg hover:bg-gray-100"
              aria-label="Back to home"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">FlowVFP Solver</h1>
              <p className="text-xs text-gray-500">Configure and launch a VFP simulation</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Import VFP Case */}
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Import VFP
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".vfp,application/json"
              className="hidden"
              onChange={handleImportVFP}
            />
            {uploadedCaseName && (
              <span className="text-xs text-blue-600 font-medium truncate max-w-[140px]" title={uploadedCaseName}>
                {uploadedCaseName}
              </span>
            )}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-full">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-xs font-medium text-blue-700">Setup</span>
            </div>
          </div>
        </div>
      </header>

      {/* ── Loading overlay with progress bar ──────────────────────────────── */}
      {isLoading && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-8 max-w-md w-full mx-4 space-y-6">
            {/* Title & spinner */}
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-12 h-12 rounded-full border-4 border-blue-100 flex items-center justify-center">
                  <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {importProgress.stage
                    ? 'Importing VFP File'
                    : submitProgress.stage
                      ? 'Preparing Simulation'
                      : 'Processing…'}
                </h3>
                <p className="text-sm text-gray-500">
                  {importProgress.stage === 'reading'  && 'Reading file…'}
                  {importProgress.stage === 'parsing'  && 'Parsing VFP data…'}
                  {importProgress.stage === 'indexing'  && 'Indexing dump files…'}
                  {importProgress.stage === 'complete' && 'Import complete!'}
                  {submitProgress.stage === 'reading'    && 'Reading input files…'}
                  {submitProgress.stage === 'building'   && 'Building payload…'}
                  {submitProgress.stage === 'finalizing' && 'Finalizing…'}
                  {submitProgress.stage === 'complete'   && 'Launching simulation…'}
                  {!importProgress.stage && !submitProgress.stage && 'Please wait…'}
                </p>
              </div>
            </div>

            {/* Progress bar */}
            {(() => {
              const pct = importProgress.stage ? importProgress.percent : submitProgress.percent;
              const isImport = !!importProgress.stage;
              return (
                <div className="space-y-2">
                  <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300 ease-out bg-gradient-to-r from-blue-500 to-indigo-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>{pct}%</span>
                    {isImport && importProgress.totalBytes > 0 && (
                      <span>
                        {(importProgress.bytesRead / (1024 * 1024)).toFixed(1)} / {(importProgress.totalBytes / (1024 * 1024)).toFixed(1)} MB
                      </span>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Stage steps */}
            {importProgress.stage && (
              <div className="space-y-2">
                {[
                  { key: 'reading',  label: 'Reading file' },
                  { key: 'parsing',  label: 'Parsing JSON stream' },
                  { key: 'indexing', label: 'Indexing dump files' },
                  { key: 'complete', label: 'Complete' },
                ].map(({ key, label }) => {
                  const stages = ['reading', 'parsing', 'indexing', 'complete'];
                  const currentIdx = stages.indexOf(importProgress.stage);
                  const stepIdx    = stages.indexOf(key);
                  const isDone     = stepIdx < currentIdx;
                  const isActive   = stepIdx === currentIdx;
                  return (
                    <div key={key} className="flex items-center gap-3">
                      {isDone ? (
                        <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      ) : isActive ? (
                        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-gray-200 flex-shrink-0" />
                      )}
                      <span className={`text-sm ${isDone ? 'text-green-700' : isActive ? 'text-blue-700 font-medium' : 'text-gray-400'}`}>
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {submitProgress.stage && (
              <div className="space-y-2">
                {[
                  { key: 'reading',    label: 'Reading input files' },
                  { key: 'building',   label: 'Building payload' },
                  { key: 'finalizing', label: 'Finalizing' },
                  { key: 'complete',   label: 'Launching simulation' },
                ].map(({ key, label }) => {
                  const stages = ['reading', 'building', 'finalizing', 'complete'];
                  const currentIdx = stages.indexOf(submitProgress.stage);
                  const stepIdx    = stages.indexOf(key);
                  const isDone     = stepIdx < currentIdx;
                  const isActive   = stepIdx === currentIdx;
                  return (
                    <div key={key} className="flex items-center gap-3">
                      {isDone ? (
                        <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      ) : isActive ? (
                        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-gray-200 flex-shrink-0" />
                      )}
                      <span className={`text-sm ${isDone ? 'text-green-700' : isActive ? 'text-blue-700 font-medium' : 'text-gray-400'}`}>
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="max-w-5xl mx-auto px-6 py-8 space-y-8">

        {/* ── 1. Simulation Parameters ─────────────────────────────────────── */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200">
            <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
              </svg>
              Simulation Parameters
            </h2>
          </div>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <Field id="simName"  label="Simulation Name" value={simName}  onChange={setSimName}  error={errors.simName}  placeholder="e.g. DC304-070M"    required />
            <Field id="mach"     label="Mach Number"     value={mach}     onChange={setMach}     error={errors.mach}     placeholder="e.g. 0.70"           required />
            <Field id="aoa"      label="Angle of Attack" value={aoa}      onChange={setAoa}      error={errors.aoa}      placeholder="e.g. 4.00"           required />
            <Field id="reynolds" label="Reynolds Number" value={reynolds} onChange={setReynolds} error={errors.reynolds} placeholder="e.g. 10000000"       required />
          </div>
        </section>

        {/* ── 2. Wing Configuration ────────────────────────────────────────── */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-gray-200">
            <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
              <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 4v8m0 0l4-4m-4 4l-4-4" />
              </svg>
              Wing Configuration
              <span className="ml-auto text-xs font-normal text-gray-500">GEO and DAT files required</span>
            </h2>
          </div>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-5">
            <FileDropZone label="Geometry File (.GEO) *" accept=".GEO,.geo" fileKey="GeoFile"
              fileName={wingFiles.GeoFile?.name} onFile={handleWingFile}
              hint="Wing geometry definition" />
            {errors.wing_GeoFile && <p className="text-xs text-red-600 -mt-3 sm:col-start-1">{errors.wing_GeoFile}</p>}
            <FileDropZone label="Map File (.MAP)" accept=".MAP,.map" fileKey="MapFile"
              fileName={wingFiles.MapFile?.name} onFile={handleWingFile}
              hint="Surface map file (optional)" />
            <FileDropZone label="Flow Data File (.DAT) *" accept=".DAT,.dat" fileKey="DatFile"
              fileName={wingFiles.DatFile?.name} onFile={handleWingFile}
              hint="Flow conditions file" />
            {errors.wing_DatFile && <p className="text-xs text-red-600 -mt-3">{errors.wing_DatFile}</p>}
          </div>
          <div className="px-6 pb-5">
            <Field id="wingDumpName" label="Wing Dump Name (continuation)" value={wingDumpName}
              onChange={setWingDumpName} placeholder="Optional — for continuation runs" />
          </div>
        </section>

        {/* ── 3. Tail Configuration (optional) ─────────────────────────────── */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-violet-50 to-purple-50 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
                <svg className="w-5 h-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3l14 9-14 9V3z" />
                </svg>
                Tail Configuration
              </h2>
              <Toggle id="includeTail" label="Include tail" checked={includeTail} onChange={setIncludeTail} />
            </div>
          </div>
          {includeTail && (
            <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-5">
              <FileDropZone label="Tail GEO File" accept=".GEO,.geo" fileKey="GeoFile"
                fileName={tailFiles.GeoFile?.name} onFile={handleTailFile} hint="Tail geometry" />
              <FileDropZone label="Tail MAP File" accept=".MAP,.map" fileKey="MapFile"
                fileName={tailFiles.MapFile?.name} onFile={handleTailFile} hint="Tail map file" />
              <FileDropZone label="Tail DAT File" accept=".DAT,.dat" fileKey="DatFile"
                fileName={tailFiles.DatFile?.name} onFile={handleTailFile} hint="Tail flow conditions" />
              <div className="sm:col-span-3">
                <Field id="tailDumpName" label="Tail Dump Name (continuation)" value={tailDumpName}
                  onChange={setTailDumpName} placeholder="Optional — for continuation runs" />
              </div>
            </div>
          )}
          {!includeTail && (
            <div className="px-6 py-4 text-sm text-gray-400 italic">
              Enable tail configuration to include horizontal stabiliser in the simulation.
            </div>
          )}
        </section>

        {/* ── 4. Body / Fuselage Files (optional) ──────────────────────────── */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-orange-50 to-amber-50 border-b border-gray-200">
            <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
              <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14" />
              </svg>
              Body / Fuselage Files
              <span className="ml-auto text-xs font-normal text-gray-500">Optional</span>
            </h2>
          </div>
          <div className="p-6 space-y-3">
            {bodyFiles.length > 0 && (
              <ul className="space-y-2">
                {bodyFiles.map((entry, idx) => (
                  <li key={idx} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
                    <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4" />
                    </svg>
                    <span className="text-sm text-gray-700 flex-1 truncate">{entry.name}</span>
                    <button type="button" onClick={() => removeBodyFile(idx)}
                      className="text-red-400 hover:text-red-600 transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" onClick={() => bodyInputRef.current.click()}
              className="flex items-center gap-2 px-4 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-orange-400 hover:text-orange-600 hover:bg-orange-50 transition-all">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add body files
            </button>
            <input ref={bodyInputRef} type="file" multiple className="hidden" onChange={handleBodyFiles} />
          </div>
        </section>

        {/* ── 5. Options ───────────────────────────────────────────────────── */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-slate-50 to-gray-50 border-b border-gray-200">
            <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Options
            </h2>
          </div>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-4">
              <Toggle id="continuationRun" label="Continuation Run"
                description="Continue from a previous simulation dump file"
                checked={continuationRun} onChange={setContinuationRun} />
              {continuationRun && (
                <div className="ml-13 pl-4 border-l-2 border-blue-200 space-y-3">
                  {/* ── JSON-analyser-style dump picker (preferred when results are available) ── */}
                  {Object.keys(importedVfpFlowKeys).length > 0 ? (
                    <>
                      {uploadedCaseName && (
                        <p className="text-xs text-gray-500 font-medium">Imported: {uploadedCaseName}</p>
                      )}
                      <VfpDumpSelector
                        flowKeyMeta={importedVfpFlowKeys}
                        selectedDump={selectedDump}
                        onSelectDump={handleDumpSelect}
                      />
                      <p className="text-[11px] text-gray-400">
                        Wing / Tail dump names above are used as fallback when no dump is selected here.
                      </p>
                    </>
                  ) : (
                    /* ── Legacy fallback: manual dump names + split-key dropdown ── */
                    <>
                      <p className="text-xs text-gray-500">
                        Import a .vfp file with results to select a continuation dump, or enter
                        Wing / Tail dump names in the sections above.
                      </p>
                      {continuationKeys.length > 0 && (
                        <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-gray-800">Continuation source</span>
                            <button
                              type="button"
                              className="text-xs text-blue-700 hover:text-blue-900 font-semibold"
                              onClick={() => setContinuationDropdownOpen(o => !o)}
                            >
                              {continuationDropdownOpen ? 'Hide' : 'Select'}
                            </button>
                          </div>
                          {uploadedCaseName && (
                            <p className="text-xs text-gray-500">Imported: {uploadedCaseName}</p>
                          )}
                          {continuationDropdownOpen && (
                            <div className="rounded-lg border border-blue-100 bg-white divide-y divide-blue-50">
                              {continuationKeys.map(key => {
                                const checked = selectedContinuationKey === key;
                                return (
                                  <label key={key} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-blue-50">
                                    <input
                                      type="checkbox"
                                      className="accent-blue-600"
                                      checked={checked}
                                      onChange={() => {
                                        setSelectedContinuationKey(checked ? '' : key);
                                        setContinuationDropdownOpen(false);
                                      }}
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
                          {selectedContinuationKey && (
                            <p className="text-xs text-blue-700 font-medium">
                              Split key: <span className="font-bold">{selectedContinuationKey}</span>
                            </p>
                          )}
                          <p className="text-[11px] text-gray-500">Select a single split node to continue from.</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
              <Toggle id="excrescence" label="Excrescence Drag"
                description="Include excrescence drag correction"
                checked={excrescence} onChange={setExcrescence} />
            </div>

            {/* Auto-runner */}
            <div className="space-y-4">
              <Toggle id="autoRunner" label="Auto Runner"
                description="Sweep Mach / AoA automatically"
                checked={autoRunner} onChange={setAutoRunner} />
              {autoRunner && (
                <div className="space-y-3 pl-4 border-l-2 border-blue-200">
                  <div className="flex gap-3">
                    {["aoa", "mach"].map((m) => (
                      <label key={m} className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="autoMode" value={m} checked={autoMode === m}
                          onChange={() => setAutoMode(m)}
                          className="text-blue-600 focus:ring-blue-500" />
                        <span className="text-sm text-gray-700 capitalize">{m === "aoa" ? "AoA Sweep" : "Mach Sweep"}</span>
                      </label>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field id="autoStepSize" label="Step Size" value={autoStepSize}
                      onChange={setAutoStepSize} placeholder="e.g. 0.5" />
                    {autoMode === "aoa"
                      ? <Field id="autoEndAoA"  label="End AoA"  value={autoEndAoA}  onChange={setAutoEndAoA}  placeholder="e.g. 8.0" />
                      : <Field id="autoEndMach" label="End Mach" value={autoEndMach} onChange={setAutoEndMach} placeholder="e.g. 0.85" />
                    }
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── Warning banner ───────────────────────────────────────────────── */}
        {(incomplete || warningMsg) && (
          <div className={`rounded-lg border px-4 py-3 flex items-start gap-3 text-sm
            ${incomplete ? "bg-amber-50 border-amber-300 text-amber-800" : "bg-blue-50 border-blue-200 text-blue-800"}`}>
            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="font-semibold">{warningMsg || "Incomplete Configuration"}</p>
              {!warningMsg && <p className="text-xs mt-0.5">Upload the required Wing files to proceed.</p>}
            </div>
          </div>
        )}

        {/* ── Submit ───────────────────────────────────────────────────────── */}
        {errors.submit && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {errors.submit}
          </div>
        )}

        <div className="flex gap-3 justify-end pb-8 items-center flex-wrap">
          <button type="button" onClick={handleSaveDraft}
            className="px-4 py-2.5 rounded-xl border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Save Draft
          </button>
          <button type="button" onClick={handleReset}
            className="px-4 py-2.5 rounded-xl border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Reset
          </button>
          <button type="button" onClick={() => navigate("/")}
            className="px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={isLoading || incomplete}
            className="px-8 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:transform-none flex items-center gap-2">
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Preparing…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Run Simulation
              </>
            )}
          </button>
        </div>

      </form>
    </div>
  );
};

export default RunSolver;

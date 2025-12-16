import { useState, useEffect } from "react";
import { useContext } from "react";
import FormDataContext from "../FormDataContext";
import { useNavigate } from "react-router-dom";
import DragNDrop from "./DragNDrop";
import { fetchAPI } from '../../utils/fetch';

function RunSolver() {
  const [simName, setsimName] = useState("");
  const [mach, setMach] = useState("");
  const [aoa, setAoA] = useState("");
  const [alpha0, setA0] = useState("");
  const [alphaN, setAN] = useState("");
  const [dalpha, setdalpha] = useState("");
  const [reynolds, setReynolds] = useState("");
  const [dumpName, setDumpName] = useState("");
  const [continuation, setContinuation] = useState(false);
  const [dump, setDump] = useState(false);
  const [excrescence, setExcrescence] = useState(false);
  const [autoRunner, setAutoRunner] = useState(false);
  const [mapImported, setMapImported] = useState(false);
  const [geoImported, setGeoImported] = useState(false);
  const [datImported, setDatImported] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);

  // Add state for storing actual filenames
  const [mapFileName, setMapFileName] = useState("");
  const [geoFileName, setGeoFileName] = useState("");
  const [datFileName, setDatFileName] = useState("");

  const { setFormData } = useContext(FormDataContext);
  const navigate = useNavigate();

  const handleSubmit = async () => {
    try {
      const formData = new FormData();

      // Append text fields
      formData.append("mach", mach);
      formData.append("aoa", aoa);
      formData.append("alpha0", alpha0);
      formData.append("dalpha", dalpha);
      formData.append("alphaN", alphaN);
      formData.append("reynolds", reynolds);
      formData.append("continuation", continuation);
      formData.append("dump", dump);
      formData.append("dumpName", dumpName);
      formData.append("excrescence", excrescence);
      formData.append("autoRunner", autoRunner);
      formData.append("mapImported", mapImported);
      formData.append("geoImported", geoImported);
      formData.append("datImported", datImported);
      formData.append("simName", simName);

      // Append actual filenames
      formData.append("mapFile", mapFileName);
      formData.append("geoFile", geoFileName);
      formData.append("datFile", datFileName);

      // Append files
      selectedFiles.forEach((file, index) => {
        formData.append(`file_${index}`, file);
      });

      setFormData(formData);

      const response = await fetchAPI("/start-vfp", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();
      console.log("Server Response:", result);
      navigate("/results", { state: { result } });
      console.log("Form Data Submitted:", { selectedFiles, mach, aoa, reynolds, continuation, excrescence });
    } catch (error) {
      console.error("Error submitting form:", error);
    }
  };

  // Update checkboxes and filenames based on selected files
  useEffect(() => {
    const mapFile = selectedFiles.find(file => file.name.endsWith(".map"));
    const geoFile = selectedFiles.find(file => file.name.endsWith(".GEO"));
    const datFile = selectedFiles.find(file => file.name.endsWith(".DAT"));

    // Update boolean states
    setMapImported(!!mapFile);
    setGeoImported(!!geoFile);
    setDatImported(!!datFile);

    // Update filename states
    setMapFileName(mapFile ? mapFile.name : "");
    setGeoFileName(geoFile ? geoFile.name : "");
    setDatFileName(datFile ? datFile.name : "");

    console.log("Updated filenames:", {
      map: mapFile ? mapFile.name : "none",
      geo: geoFile ? geoFile.name : "none",
      dat: datFile ? datFile.name : "none"
    });
  }, [selectedFiles]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200 font-sans">
      {/* Header Section */}
      <div className="bg-white/95 backdrop-blur-md shadow-lg border-b border-gray-200 px-6 py-3 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-3 items-center gap-4">
            {/* Back Button */}
            <div className="flex justify-start">
              <button
                className="inline-flex items-center gap-2 px-4 py-2 bg-gray-800 text-white border-none rounded-md font-medium cursor-pointer transition-all duration-200 text-sm whitespace-nowrap hover:bg-gray-700 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0"
                onClick={() => navigate("/")}
              >
                <span className="font-bold text-sm">←</span>
                Back to Main Module
              </button>
            </div>

            {/* Page Title */}
            <div className="flex justify-center">
              <h1 className="text-2xl font-semibold text-gray-800 text-center whitespace-nowrap">
                Flow Conditions and Solver Parameters
              </h1>
            </div>

            {/* Empty space for balance */}
            <div className="hidden lg:block"></div>
          </div>
        </div>
      </div>

      {/* Main Content - Laptop-First Layout */}
      <div className="max-w-7xl mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* File Upload Panel - Left Side on Laptop */}
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden h-fit">
            {/* Panel Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-gray-200 relative">
              <h2 className="text-xl font-semibold text-gray-700 m-0">File Import</h2>
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-blue-500 to-transparent"></div>
            </div>

            {/* Drag and Drop Area */}
            <div className="p-6 flex justify-center items-center">
              <DragNDrop onFilesSelected={setSelectedFiles} width="100%" />
            </div>

            {/* File Status */}
            <div className="px-6 pb-6">
              <div className="flex flex-col gap-3">
                {/* GEO File Status */}
                <div className={`flex items-center gap-4 p-3 rounded-lg border transition-all duration-200 ${geoImported
                  ? 'bg-blue-50 border-blue-200 text-blue-800'
                  : 'bg-slate-50 border-gray-200'
                  }`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-colors duration-200 ${geoImported
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-300 text-gray-600'
                    }`}>
                    {geoImported ? '✓' : '○'}
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-sm">GEO File</span>
                    {geoFileName && (
                      <span className="text-xs opacity-70 font-mono">{geoFileName}</span>
                    )}
                  </div>
                </div>

                {/* MAP File Status */}
                <div className={`flex items-center gap-4 p-3 rounded-lg border transition-all duration-200 ${mapImported
                  ? 'bg-blue-50 border-blue-200 text-blue-800'
                  : 'bg-slate-50 border-gray-200'
                  }`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-colors duration-200 ${mapImported
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-300 text-gray-600'
                    }`}>
                    {mapImported ? '✓' : '○'}
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-sm">MAP File</span>
                    {mapFileName && (
                      <span className="text-xs opacity-70 font-mono">{mapFileName}</span>
                    )}
                  </div>
                </div>

                {/* DAT File Status */}
                <div className={`flex items-center gap-4 p-3 rounded-lg border transition-all duration-200 ${datImported
                  ? 'bg-blue-50 border-blue-200 text-blue-800'
                  : 'bg-slate-50 border-gray-200'
                  }`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-colors duration-200 ${datImported
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-300 text-gray-600'
                    }`}>
                    {datImported ? '✓' : '○'}
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-sm">DAT File</span>
                    {datFileName && (
                      <span className="text-xs opacity-70 font-mono">{datFileName}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Parameters Panel - Right Side on Laptop */}
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            {/* Panel Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-gray-200 relative">
              <h2 className="text-xl font-semibold text-gray-700 m-0">Solver Configuration</h2>
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-blue-500 to-transparent"></div>
            </div>

            <div className="p-6">
              {/* Basic Parameters */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-700 mb-4 flex items-center gap-2">
                  <div className="w-1 h-5 bg-blue-500 rounded-full"></div>
                  Basic Parameters
                </h3>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block font-medium text-gray-700 text-sm mb-2">
                      Simulation Name
                    </label>
                    <input
                      type="text"
                      value={simName}
                      onChange={(e) => setsimName(e.target.value)}
                      placeholder="Enter simulation name"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm transition-all duration-200 bg-white focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 placeholder-gray-400"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block font-medium text-gray-700 text-sm mb-2">
                        Mach Number
                      </label>
                      <input
                        type="number"
                        value={mach}
                        onChange={(e) => setMach(e.target.value)}
                        placeholder="0.0"
                        step="0.01"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm transition-all duration-200 bg-white focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 placeholder-gray-400"
                      />
                    </div>

                    <div>
                      <label className="block font-medium text-gray-700 text-sm mb-2">
                        Angle of Attack (°)
                      </label>
                      <input
                        type="number"
                        value={aoa}
                        onChange={(e) => setAoA(e.target.value)}
                        placeholder="0.0"
                        step="0.1"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm transition-all duration-200 bg-white focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 placeholder-gray-400"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-medium text-gray-700 text-sm mb-2">
                      Reynolds Number
                    </label>
                    <input
                      type="number"
                      value={reynolds}
                      onChange={(e) => setReynolds(e.target.value)}
                      placeholder="1000000"
                      step="1000"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm transition-all duration-200 bg-white focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 placeholder-gray-400"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-gray-700 text-sm mb-2">
                      Dump File Name <span className="font-normal text-gray-500 italic">(For Continuation Runs Only)</span>
                    </label>
                    <input
                      type="text"
                      value={dumpName}
                      onChange={(e) => setDumpName(e.target.value)}
                      placeholder="Enter dump file name"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm transition-all duration-200 bg-white focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 placeholder-gray-400"
                    />
                  </div>
                </div>
              </div>

              {/* Run Options */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-700 mb-4 flex items-center gap-2">
                  <div className="w-1 h-5 bg-blue-500 rounded-full"></div>
                  Run Options
                </h3>
                <div className="grid grid-cols-1 gap-3">
                  {/* Excrescence Run */}
                  <label className="flex items-center gap-3 cursor-pointer p-3 border border-gray-200 rounded-lg bg-slate-50 transition-all duration-200 hover:bg-slate-100 hover:border-blue-300">
                    <input
                      type="checkbox"
                      checked={excrescence}
                      onChange={() => {
                        setExcrescence(!excrescence);
                        console.log("Excrescence Run:", !excrescence);
                      }}
                      className="sr-only"
                    />
                    <div className={`w-5 h-5 border rounded flex items-center justify-center transition-all duration-200 ${excrescence
                      ? 'bg-blue-500 border-blue-500'
                      : 'border-gray-300 bg-white'
                      }`}>
                      {excrescence && (
                        <span className="text-white font-bold text-xs">✓</span>
                      )}
                    </div>
                    <span className="font-medium text-gray-700 text-sm select-none">
                      Excrescence Run
                    </span>
                  </label>

                  {/* Continuation Run */}
                  <label className="flex items-center gap-3 cursor-pointer p-3 border border-gray-200 rounded-lg bg-slate-50 transition-all duration-200 hover:bg-slate-100 hover:border-blue-300">
                    <input
                      type="checkbox"
                      checked={continuation}
                      onChange={() => {
                        setContinuation(!continuation);
                        console.log("Continuation Run:", !continuation);
                      }}
                      className="sr-only"
                    />
                    <div className={`w-5 h-5 border rounded flex items-center justify-center transition-all duration-200 ${continuation
                      ? 'bg-blue-500 border-blue-500'
                      : 'border-gray-300 bg-white'
                      }`}>
                      {continuation && (
                        <span className="text-white font-bold text-xs">✓</span>
                      )}
                    </div>
                    <span className="font-medium text-gray-700 text-sm select-none">
                      Continuation Run
                    </span>
                  </label>

                  {/* Auto-Runner */}
                  <label className="flex items-center gap-3 cursor-pointer p-3 border border-gray-200 rounded-lg bg-slate-50 transition-all duration-200 hover:bg-slate-100 hover:border-blue-300">
                    <input
                      type="checkbox"
                      checked={autoRunner}
                      onChange={() => setAutoRunner(!autoRunner)}
                      className="sr-only"
                    />
                    <div className={`w-5 h-5 border rounded flex items-center justify-center transition-all duration-200 ${autoRunner
                      ? 'bg-blue-500 border-blue-500'
                      : 'border-gray-300 bg-white'
                      }`}>
                      {autoRunner && (
                        <span className="text-white font-bold text-xs">✓</span>
                      )}
                    </div>
                    <span className="font-medium text-gray-700 text-sm select-none">
                      Auto-Runner
                    </span>
                  </label>
                </div>
              </div>

              {/* Auto-Runner Options */}
              {autoRunner && (
                <div className="mb-6 bg-slate-50 rounded-lg p-4 border border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-700 mb-4 flex items-center gap-2">
                    <div className="w-1 h-5 bg-blue-500 rounded-full"></div>
                    Auto-Runner Configuration
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block font-medium text-gray-700 text-sm mb-2">
                        Step Size (°)
                      </label>
                      <input
                        type="number"
                        value={dalpha}
                        onChange={(e) => setdalpha(e.target.value)}
                        placeholder="1.0"
                        step="0.1"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm transition-all duration-200 bg-white focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 placeholder-gray-400"
                      />
                    </div>

                    <div>
                      <label className="block font-medium text-gray-700 text-sm mb-2">
                        End Angle of Attack (°)
                      </label>
                      <input
                        type="number"
                        value={alphaN}
                        onChange={(e) => setAN(e.target.value)}
                        placeholder="10.0"
                        step="0.1"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm transition-all duration-200 bg-white focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 placeholder-gray-400"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Continuation Option */}
              {continuation && (
                <div className="mb-6">
                  <label className="flex items-center gap-3 cursor-pointer p-4 border border-gray-200 rounded-lg bg-white transition-all duration-200 hover:bg-slate-50 hover:border-blue-300">
                    <input
                      type="checkbox"
                      checked={dump}
                      onChange={() => setDump(!dump)}
                      className="sr-only"
                    />
                    <div className={`w-5 h-5 border rounded flex items-center justify-center transition-all duration-200 ${dump
                      ? 'bg-blue-500 border-blue-500'
                      : 'border-gray-300 bg-white'
                      }`}>
                      {dump && (
                        <span className="text-white font-bold text-xs">✓</span>
                      )}
                    </div>
                    <span className="font-medium text-gray-700 text-sm select-none">
                      Continuation run at same Mach and alpha
                    </span>
                  </label>
                </div>
              )}

              {/* Submit Button */}
              <div className="pt-6 border-t border-gray-200 text-center">
                <button
                  className="inline-flex items-center gap-3 px-6 py-4 bg-emerald-600 text-white border-none rounded-lg text-base font-semibold cursor-pointer transition-all duration-200 shadow-lg hover:bg-emerald-700 hover:-translate-y-1 hover:shadow-xl active:translate-y-0 group"
                  onClick={handleSubmit}
                >
                  <span className="text-base">🚀</span>
                  <span className="flex-1">Start VFP Simulation</span>
                  <span className="text-base transition-transform duration-200 group-hover:translate-x-1">→</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RunSolver;
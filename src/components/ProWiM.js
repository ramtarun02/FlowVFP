import React, { useState, useEffect } from "react";
import Prowim3Dmodel from "./Prowim3Dmodel";
import { useNavigate, useLocation } from "react-router-dom";
import Plot from 'react-plotly.js';
import { useSimulationData } from "../components/SimulationDataContext";

import { fetchAPI } from '../utils/fetch';

function computeKS0D(CL0, CD0, A) {
  if (!A || !CL0 || !CD0) return "";
  const pi = Math.PI;
  try {
    return (
      1 -
      Math.sqrt(
        ((2 * CL0) / (pi * A)) ** 2 +
        (1 - (2 * CD0) / (pi * A)) ** 2
      )
    ).toFixed(5);
  } catch {
    return "";
  }
}

function computeTS0D(CL0, CD0, A) {
  if (!A || !CL0 || !CD0) return "";
  const pi = Math.PI;
  try {
    const numerator = (2 / (pi * A)) * CL0;
    const denominator = 1 - (2 / (pi * A)) * CD0;
    const radians = Math.atan(numerator / denominator);
    const degrees = radians * (180 / pi);
    return degrees.toFixed(5);
  } catch {
    return "";
  }
}

// Rounding helpers
const roundRatio = (val) => Math.round(parseFloat(val) * 10000) / 10000;  // 4 dp  – ratios (b/D, c/D, NSPSW, y/b, ZPD, A)
const roundAngle = (val) => Math.round(parseFloat(val) * 100) / 100;        // 2 dp  – angles (alpha, IW, ALFAWI, theta_s)
const roundOther = (val) => Math.round(parseFloat(val) * 1000) / 1000;      // 3 dp  – everything else
const roundArr   = (arr, fn) => (arr || []).map(v => fn(v));

function PropellerWingForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const [showPlots, setShowPlots] = useState(false);
  const [isPolarPanelOpen, setIsPolarPanelOpen] = useState(true);
  const [csvFiles, setCsvFiles] = useState([]);
  const [selectedCsvFile, setSelectedCsvFile] = useState(null);
  const [polarData, setPolarData] = useState(null);
  const [polarsFromCase, setPolarsFromCase] = useState(false);
  const [polarsStatus, setPolarsStatus] = useState('idle');
  const { simulationData, aeroCoefficients } = useSimulationData();
  const [cd0WithDrag, setCd0WithDrag] = useState([]);

  useEffect(() => {
    if (simulationData && !polarsFromCase) {
      scanForCsvFiles(simulationData);
    }
  }, [simulationData, polarsFromCase]);

  const [formData, setFormData] = useState({
    A: "11",
    bOverD: "6.39",
    cOverD: "0.71",
    alpha0: "-2",
    N: "2",
    NSPSW: "0.4225",
    ZPD: "-0.1",
    IW: "-2",
    NELMNT: "0",
    CTIP: "0.15",
    NAW: "1",
    ALFAWI: "5",
    CL0: "0.5",
    CD0: "0.0230",
    additionalDrag: "0.0",
    KS00: "0.001",
    TS00: "2.25",
    propLocation: "0.35",
    D: "3.35"
  });

  const [panelWidth, setPanelWidth] = useState(500);
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = React.useRef(null);

  const handleMouseDown = React.useCallback((e) => {
    setIsResizing(true);
    e.preventDefault();
  }, []);

  const handleMouseMove = React.useCallback((e) => {
    if (!isResizing) return;
    const newWidth = e.clientX;
    if (newWidth >= 220 && newWidth <= 600) {
      setPanelWidth(newWidth);
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

  const renderCsvList = () => (
    <div className="mb-4">
      <h3 className="text-base font-semibold text-gray-800 mb-2 pb-2 border-b-2 border-blue-400">
        Available CSV Files
      </h3>
      <div className="flex flex-col gap-2 max-h-32 overflow-y-auto border border-blue-200 rounded-lg p-2 bg-blue-50">
        {csvFiles.length === 0 ? (
          <div className="text-gray-600 text-sm">No CSV files detected</div>
        ) : (
          csvFiles.map((file, idx) => (
            <div
              key={idx}
              className={`flex items-center p-2 bg-white border border-blue-200 rounded-lg cursor-pointer transition-all duration-200 hover:bg-blue-50 hover:border-blue-400 hover:shadow-sm ${selectedCsvFile?.name === file.name ? 'ring-2 ring-blue-500 border-blue-500' : ''}`}
              onClick={() => handleCsvFileSelect(file)}
              title={file.name}
            >
              <span className="text-lg mr-2">📊</span>
              <span className="flex-1 text-xs font-medium text-gray-800 truncate">{file.name}</span>
              {selectedCsvFile?.name === file.name && (
                <span className="text-blue-600 font-bold text-sm">✓</span>
              )}
            </div>
          ))
        )}
      </div>
      {polarData && (
        <div className="mt-4 p-3 bg-green-50 rounded-lg border-l-4 border-green-400">
          <h4 className="text-sm font-semibold text-green-800 mb-2">Loaded Polar Data:</h4>
          <div className="space-y-1 text-xs text-green-700">
            <p><span className="font-medium">Points:</span> {polarData.alpha.length}</p>
            <p><span className="font-medium">Alpha range:</span> {Math.min(...polarData.alpha).toFixed(1)}° to {Math.max(...polarData.alpha).toFixed(1)}°</p>
            <p><span className="font-medium">CL range:</span> {Math.min(...polarData.cl).toFixed(3)} to {Math.max(...polarData.cl).toFixed(3)}</p>
            <p><span className="font-medium">CD range:</span> {Math.min(...polarData.cd).toFixed(4)} to {Math.max(...polarData.cd).toFixed(4)}</p>
          </div>
        </div>
      )}
    </div>
  );

  const renderPolarsBanner = () => {
    if (polarsFromCase && polarData) {
      return (
        <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg shadow-sm">
          <div className="flex items-center gap-2 text-emerald-800 text-sm font-semibold">
            <span>✅ Polars loaded from .vfp results</span>
            <span className="text-xs px-2 py-1 bg-white border border-emerald-200 rounded-full">{polarData.alpha.length} points</span>
          </div>
          <p className="text-xs text-emerald-700 mt-1">Alpha, CL, and CD0 were auto-filled. CSV import is optional.</p>
        </div>
      );
    }
    if (polarsStatus === 'aero' && polarData) {
      return (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
          Aerodynamic coefficients (CL/CD) from the case were used to prefill CL0/CD0. Adjust ALFAWI as needed.
        </div>
      );
    }
    if (polarsStatus === 'missing') {
      return (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
          No polars found in this case. You can still load CSV polars manually if available.
        </div>
      );
    }
    return null;
  };

  const [arrayInputs, setArrayInputs] = useState({
    ALFAWI: [5],
    CL0: [0.5],
    CD0: [0.0230],
    additionalDrag: 0,
    KS00: [0.001],
    TS00: [computeTS0D(0.5, 0.0230, 8)]
  });

  const scanForCsvFiles = (simData) => {
    if (!simData || !simData.files) {
      setCsvFiles([]);
      return;
    }
    const files = simData.files;
    let csvFileList = [];
    Object.values(files).forEach(fileTypeArray => {
      if (Array.isArray(fileTypeArray)) {
        const csvs = fileTypeArray.filter(file =>
          file.name && file.name.toLowerCase().endsWith('.csv')
        );
        csvFileList = csvFileList.concat(csvs);
      }
    });
    setCsvFiles(csvFileList);
  };

  const applyPolarData = React.useCallback((polars) => {
    if (!polars) return false;
    const alpha = polars.alpha || [];
    const cl = polars.cl || [];
    const cd = polars.cd || [];
    const valid = Array.isArray(alpha) && Array.isArray(cl) && Array.isArray(cd) && alpha.length && cl.length && cd.length;
    if (!valid) return false;

    setPolarData({ alpha, cl, cd });
    setArrayInputs(prev => ({
      ...prev,
      ALFAWI: alpha,
      CL0: cl,
      CD0: cd
    }));
    setFormData(prev => ({
      ...prev,
      ALFAWI: alpha.join(', '),
      CL0: cl.map(v => (Number.isFinite(v) ? v.toFixed(3) : v)).join(', '),
      CD0: cd.map(v => (Number.isFinite(v) ? v.toFixed(4) : v)).join(', ')
    }));
    setPolarsFromCase(true);
    setPolarsStatus('loaded');
    return true;
  }, []);

  useEffect(() => {
    const navPolars = location.state?.polars;
    const ctxPolars = simulationData?.polars;
    const sourcePolars = navPolars || ctxPolars;

    if (sourcePolars) {
      const alpha = sourcePolars.alpha || sourcePolars.ALFAWI || sourcePolars.alfa || sourcePolars.ALPHA;
      const cl = sourcePolars.cl || sourcePolars.CL || sourcePolars.CL0;
      const cd = sourcePolars.cd || sourcePolars.CDtotVFP || sourcePolars.CD || sourcePolars.CD0;
      const applied = applyPolarData({ alpha, cl, cd });
      if (!applied) {
        setPolarsFromCase(false);
        setPolarsStatus('missing');
      }
      return;
    }

    if (aeroCoefficients && (aeroCoefficients.CL !== undefined) && (aeroCoefficients.CD !== undefined)) {
      const alphaFallback = [0];
      const clFallback = [aeroCoefficients.CL ?? 0];
      const cdFallback = [aeroCoefficients.CD ?? 0];
      setPolarData({ alpha: alphaFallback, cl: clFallback, cd: cdFallback });
      setArrayInputs(prev => ({
        ...prev,
        ALFAWI: alphaFallback,
        CL0: clFallback,
        CD0: cdFallback
      }));
      setFormData(prev => ({
        ...prev,
        ALFAWI: alphaFallback.join(', '),
        CL0: clFallback.map(v => (Number.isFinite(v) ? v.toFixed(3) : v)).join(', '),
        CD0: cdFallback.map(v => (Number.isFinite(v) ? v.toFixed(4) : v)).join(', ')
      }));
      setPolarsFromCase(false);
      setPolarsStatus('aero');
      return;
    }

    if (sourcePolars === null) {
      setPolarsFromCase(false);
      setPolarsStatus('missing');
    }
  }, [applyPolarData, aeroCoefficients, location.state, simulationData]);

  const fetchCsvFile = async (file) => {
    try {
      const simName = simulationData?.simName || 'unknown';
      const response = await fetchAPI(`/get_file_content`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          simName: simName,
          filePath: file.path || file.name
        })
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }
      const content = await response.text();
      return content;
    } catch (error) {
      alert(`Error loading file ${file.name}: ${error.message}`);
      return null;
    }
  };

  const parseCsvContent = (content) => {
    try {
      const lines = content.split('\n').map(line => line.trim()).filter(line => line);
      if (lines.length === 0) throw new Error('CSV file is empty');
      let headerIndex = -1;
      let alphaIndex = -1;
      let clIndex = -1;
      let cdIndex = -1;
      for (let i = 0; i < Math.min(5, lines.length); i++) {
        const headers = lines[i].split(/[,;\t]/).map(h => h.trim().toLowerCase());
        alphaIndex = headers.findIndex(h =>
          h.includes('alpha') || h.includes('angle') || h.includes('aoa') || h === 'α'
        );
        clIndex = headers.findIndex(h =>
          h.includes('cl') || h.toLowerCase() === 'lift'
        );
        const cdGenericIndex = headers.findIndex(h =>
          h === 'cd' || h === 'cd0' || h.includes('drag')
        );
        const cdTotIndex = headers.findIndex(h => h.includes('cdtotvfp'));
        cdIndex = cdGenericIndex !== -1 ? cdGenericIndex : cdTotIndex;
        if (alphaIndex !== -1 && clIndex !== -1 && cdIndex !== -1) {
          headerIndex = i;
          break;
        }
      }
      if (headerIndex === -1) throw new Error('Could not find Alpha, CL, and CD columns in CSV file');
      const dataRows = lines.slice(headerIndex + 1);
      const polarData = { alpha: [], cl: [], cd: [] };
      dataRows.forEach((line) => {
        const values = line.split(/[,;\t]/).map(v => v.trim());
        if (values.length > Math.max(alphaIndex, clIndex, cdIndex)) {
          const alpha = parseFloat(values[alphaIndex]);
          const cl = parseFloat(values[clIndex]);
          const cd = parseFloat(values[cdIndex]);
          if (!isNaN(alpha) && !isNaN(cl) && !isNaN(cd)) {
            polarData.alpha.push(alpha);
            polarData.cl.push(cl);
            polarData.cd.push(cd);
          }
        }
      });
      if (polarData.alpha.length === 0) throw new Error('No valid data rows found in CSV file');
      return polarData;
    } catch (error) {
      alert(`Error parsing CSV file: ${error.message}`);
      return null;
    }
  };

  const handleCsvFileSelect = async (file) => {
    setSelectedCsvFile(file);
    let content = null;
    if (file.file) {
      try {
        content = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.onerror = (e) => reject(e);
          reader.readAsText(file.file);
        });
      } catch (error) {
        alert(`Error reading CSV file: ${error.message}`);
        return;
      }
    } else {
      content = await fetchCsvFile(file);
      if (!content) return;
    }
    const parsed = parseCsvContent(content);
    if (parsed) {
      setPolarData(parsed);
      setArrayInputs(prev => ({
        ...prev,
        ALFAWI: parsed.alpha,
        CL0: parsed.cl,
        CD0: parsed.cd
      }));
      setFormData(prev => ({
        ...prev,
        ALFAWI: parsed.alpha.join(', '),
        CL0: parsed.cl.map(v => v.toFixed(3)).join(', '),
        CD0: parsed.cd.map(v => v.toFixed(4)).join(', ')
      }));
    }
  };

  useEffect(() => {
    const addDrag = Number(arrayInputs.additionalDrag) || 0;
    const baseCd0 = arrayInputs.CD0 || [];
    const cdWithDrag = baseCd0.map(cd0 => (Number(cd0) || 0) + addDrag);

    setCd0WithDrag(cdWithDrag);

    const A = parseFloat(formData.A);
    if (A && arrayInputs.CL0.length > 0 && cdWithDrag.length > 0) {
      const newKS00 = arrayInputs.CL0.map((cl0, index) => {
        const cd0 = cdWithDrag[index] !== undefined ? cdWithDrag[index] : cdWithDrag[0];
        return parseFloat(computeKS0D(cl0, cd0, A));
      });
      const newTS00 = arrayInputs.CL0.map((cl0, index) => {
        const cd0 = cdWithDrag[index] !== undefined ? cdWithDrag[index] : cdWithDrag[0];
        return parseFloat(computeTS0D(cl0, cd0, A));
      });
      setArrayInputs(prev => ({ ...prev, KS00: newKS00, TS00: newTS00 }));
    }
  }, [formData.A, arrayInputs.CL0, arrayInputs.CD0, arrayInputs.additionalDrag]);

  const [result, setResult] = useState(null);
  const [clResultKey, setClResultKey] = useState('CZDwf');
  const [cdResultKey, setCdResultKey] = useState('CXDwf');

  const CL_OPTIONS = [
    { value: 'CZD',   label: 'CZD' },
    { value: 'CZDwf', label: 'CZDwf' },
    { value: 'CZwf',  label: 'CZwf' },
    { value: 'CZ',    label: 'CZ' },
  ];
  const CD_OPTIONS = [
    { value: 'CXDwf', label: 'CXDwf' },
    { value: 'CXD',   label: 'CXD' },
    { value: 'CXwf',  label: 'CXwf' },
    { value: 'CX',    label: 'CX' },
  ];

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (name === "additionalDrag") {
      const dragVal = parseFloat(value) || 0;
      setArrayInputs(prev => ({ ...prev, additionalDrag: dragVal }));
    }
  };

  const handleArrayChange = (name, value) => {
    if (name === 'additionalDrag') {
      const dragValue = parseFloat(value) || 0;
      setArrayInputs(prev => ({ ...prev, additionalDrag: dragValue }));
      setFormData(prev => ({ ...prev, [name]: value }));
      return;
    }

    const values = value
      .replace(/,/g, ' ')
      .split(/\s+/)
      .map(v => v.trim())
      .filter(v => v !== '')
      .map(v => parseFloat(v))
      .filter(v => !isNaN(v));
    setArrayInputs(prev => ({ ...prev, [name]: values }));
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const addDrag = Number(arrayInputs.additionalDrag) || 0;
      const fallbackCd0 = (arrayInputs.CD0 || []).map(cd0 => (Number(cd0) || 0) + addDrag);
      const cd0ForSubmit = cd0WithDrag.length ? cd0WithDrag : fallbackCd0;

      console.log("Submitting with CD0 + Additional Drag:", cd0ForSubmit);
      const payload = {
        // ratios – 4 dp
        A:            roundRatio(formData.A),
        bOverD:       roundRatio(formData.bOverD),
        cOverD:       roundRatio(formData.cOverD),
        NSPSW:        roundRatio(formData.NSPSW),
        ZPD:          roundRatio(formData.ZPD),
        propLocation: roundRatio(formData.propLocation),
        // angles – 2 dp
        alpha0: roundAngle(formData.alpha0),
        IW:     roundAngle(formData.IW),
        // other scalars – 3 dp
        N:      roundOther(formData.N),
        CTIP:   roundOther(formData.CTIP),
        D:      roundOther(formData.D),
        // integer / enum fields – pass through as-is
        NELMNT: parseInt(formData.NELMNT),
        NAW:    parseInt(formData.NAW),
        // arrays
        ALFAWI: roundArr(arrayInputs.ALFAWI, roundAngle),
        CL0:    roundArr(arrayInputs.CL0,    roundOther),
        CD0:    roundArr(cd0ForSubmit,        roundOther),
        KS00:   roundArr(arrayInputs.KS00,   roundOther),
        TS00:   roundArr(arrayInputs.TS00,   roundAngle)
      };
      console.log("Submitting payload:", payload);      
      
      const response = await fetchAPI("/prowim-compute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        const data = await response.json();
        setResult(data.results);
        console.log("Prowim results:", data.results);
      } else {
        const errorText = await response.text();
        console.error("Error:", response.statusText, errorText);
      }
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const handlePlotResults = () => {
    setShowPlots(true);
  };

  const handleBackToModel = () => {
    setShowPlots(false);
  };



  const cd0Display = cd0WithDrag.length ? cd0WithDrag : arrayInputs.CD0;
  const handleExportResults = (format = 'csv') => {
    if (!result || !Array.isArray(result) || result.length === 0) {
      alert("No results to export.");
      return;
    }
    const headers = ['Set', 'ALFAWI', 'CL0', 'CD0', 'KS00', `CL_Prop (${clResultKey})`, `CD_Prop (${cdResultKey})`];
    const rows = result.map((res, index) => [
      index + 1,
      arrayInputs.ALFAWI[index] != null ? roundAngle(arrayInputs.ALFAWI[index]).toFixed(2) : 'N/A',
      arrayInputs.CL0[index]    != null ? roundOther(arrayInputs.CL0[index]).toFixed(3)    : 'N/A',
      cd0Display[index]         != null ? roundOther(cd0Display[index]).toFixed(3)          : 'N/A',
      arrayInputs.KS00[index]   != null ? roundOther(arrayInputs.KS00[index]).toFixed(3)   : 'N/A',
      res[clResultKey]           != null ? roundOther(res[clResultKey]).toFixed(3)           : 'N/A',
      res[cdResultKey]           != null ? roundOther(Math.abs(res[cdResultKey])).toFixed(3) : 'N/A'
    ]);
    let content = '';
    let filename = '';
    let mimeType = '';
    if (format === 'csv') {
      content = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
      filename = 'prowim_results.csv';
      mimeType = 'text/csv';
    } else if (format === 'txt') {
      const columnWidths = headers.map((header, colIndex) =>
        Math.max(
          header.length,
          ...rows.map(row => String(row[colIndex]).length)
        )
      );
      const formatRow = (row) =>
        row.map((cell, index) => String(cell).padEnd(columnWidths[index])).join(' ');
      content = [formatRow(headers), ...rows.map(formatRow)].join('\n');
      filename = 'prowim_results.txt';
      mimeType = 'text/plain';
    }
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportDropdown = (event) => {
    const format = event.target.value;
    if (format) {
      handleExportResults(format);
      event.target.value = '';
    }
  };

  // Prepare Plotly chart data
  const preparePlotlyData = () => {
    if (!result || !Array.isArray(result)) return { clPlot: null, cdPlot: null };
    const alphaValues = arrayInputs.ALFAWI;
    const clValues = result.map(res => res[clResultKey]);
    const cdValues = result.map(res => res[cdResultKey] != null ? Math.abs(res[cdResultKey]) : null);
    const cl0Values = arrayInputs.CL0;
    const cd0Values = cd0Display;

    const clPlot = [
      {
        x: alphaValues,
        y: clValues,
        type: 'scatter',
        mode: 'lines+markers',
        name: `CL_Prop (${clResultKey})`,
        line: { color: 'rgb(75,192,192)', width: 3 },
        marker: { color: 'rgb(75,192,192)', size: 8 }
      },
      {
        x: alphaValues,
        y: cl0Values,
        type: 'scatter',
        mode: 'lines+markers',
        name: 'CL0 (Input)',
        line: { color: 'rgb(54,162,235)', dash: 'dash', width: 3 },
        marker: { color: 'rgb(54,162,235)', size: 8 }
      }
    ];

    const cdPlot = [
      {
        x: alphaValues,
        y: cdValues,
        type: 'scatter',
        mode: 'lines+markers',
        name: `CD_Prop (${cdResultKey})`,
        line: { color: 'rgb(255,99,132)', width: 3 },
        marker: { color: 'rgb(255,99,132)', size: 8 }
      },
      {
        x: alphaValues,
        y: cd0Values,
        type: 'scatter',
        mode: 'lines+markers',
        name: 'CD0 (Input)',
        line: { color: 'rgb(255,159,64)', dash: 'dash', width: 3 },
        marker: { color: 'rgb(255,159,64)', size: 8 }
      }
    ];

    return { clPlot, cdPlot };
  };

  const { clPlot, cdPlot } = preparePlotlyData();

  // Chart layout functions for CL and CD plots
  const getCLChartLayout = () => ({
    autosize: true,
    margin: { t: 60, l: 60, r: 30, b: 60 },
    legend: { orientation: "h", x: 0.5, xanchor: "center", y: 1.15 },

    xaxis: {
      title: { text: 'Angle of Attack (°)' },
      tickformat: '.3f',
      automargin: true
    },
    yaxis: {
      title: { text: `Lift (${clResultKey})` },
      automargin: true
    },
    height: 380,
    width: undefined
  });

  const getCDChartLayout = () => ({
    autosize: true,
    margin: { t: 60, l: 60, r: 30, b: 60 },
    legend: { orientation: "h", x: 0.5, xanchor: "center", y: 1.15 },

    xaxis: {
      title: { text: 'Angle of Attack (°)' },
      tickformat: '.3f',
      automargin: true
    },
    yaxis: {
      title: { text: `Drag (${cdResultKey})` },
      automargin: true
    },
    height: 380,
    width: undefined
  });



  return (
    <div className="flex h-screen bg-blue-50 font-sans">
      {/* Left Panel: CSV Files + Input Fields */}
      <div
        className="bg-white border-r border-blue-200 p-3 overflow-y-auto flex-shrink-0 relative transition-all duration-300"
        style={{ width: `${panelWidth}px`, minWidth: '400px', maxWidth: '750px' }}
      >
        <div
          ref={resizeRef}
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-400 transition-colors duration-200 ${isResizing ? 'bg-blue-400' : 'bg-blue-200'}`}
          onMouseDown={handleMouseDown}
          style={{ zIndex: 10, height: '100%' }}
        />
        {renderPolarsBanner()}
        {renderCsvList()}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Wing Aspect Ratio (A)</label>
              <input type="number" step="any" name="A" value={formData.A} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">b / D</label>
              <input type="number" step="any" name="bOverD" value={formData.bOverD} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">c / D</label>
              <input type="number" step="any" name="cOverD" value={formData.cOverD} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 text-sm" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Angle of attack at zero lift (α₀) [deg]</label>
              <input type="number" step="any" name="alpha0" value={formData.alpha0} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Total number of propellers (N)</label>
              <input type="number" step="any" name="N" value={formData.N} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">NSPSW</label>
              <input type="number" step="any" name="NSPSW" value={formData.NSPSW} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">ZPD</label>
              <input type="number" step="any" name="ZPD" value={formData.ZPD} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">IW [deg]</label>
              <input type="number" step="any" name="IW" value={formData.IW} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 text-sm" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Thrust Coefficient (CTIP)</label>
              <input type="number" step="any" name="CTIP" value={formData.CTIP} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 text-sm" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Propeller Location along Wing Span (y/b)</label>
              <input type="number" step="any" name="propLocation" value={formData.propLocation} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 text-sm" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Propeller Diameter (D) [m]</label>
              <input type="number" step="any" name="D" value={formData.D} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 text-sm" />
            </div>
          </div>
          <div className="space-y-3 pt-4 border-t border-gray-200">
            <h3 className="text-base font-semibold text-gray-800">Flight Conditions</h3>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                ALFAWI [deg]
                {polarData && <span className="ml-2 px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">📊 Auto-filled</span>}
              </label>
              <input type="text" name="ALFAWI" value={formData.ALFAWI} onChange={(e) => handleArrayChange("ALFAWI", e.target.value)} placeholder="0, 5, 10" required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 text-sm" />
              <p className="text-xs text-gray-500 mt-1">Current values: [{(arrayInputs.ALFAWI || []).map(val => Number(val ?? 0).toFixed(2)).join(', ')}]</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                CL0
                {polarData && <span className="ml-2 px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">📊 Auto-filled</span>}
              </label>
              <input type="text" name="CL0" value={formData.CL0} onChange={(e) => handleArrayChange("CL0", e.target.value)} placeholder="0.5, 0.6, 0.7" required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 text-sm" />
              <p className="text-xs text-gray-500 mt-1">Current values: [{(arrayInputs.CL0 || []).map(val => Number(val ?? 0).toFixed(3)).join(', ')}]</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                CD0
                {polarData && <span className="ml-2 px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">📊 Auto-filled</span>}
              </label>
              <input type="text" name="CD0" value={formData.CD0} onChange={(e) => handleArrayChange("CD0", e.target.value)} placeholder="0.02, 0.025, 0.03" required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 text-sm" />
              <p className="text-xs text-gray-500 mt-1">Current values: [{(arrayInputs.CD0 || []).map(val => Number(val ?? 0).toFixed(3)).join(', ')}]</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Additional Drag to be added to CD0</label>
              <input type="number" step="any" name="additionalDrag" value={formData.additionalDrag} onChange={(e) => handleArrayChange("additionalDrag", e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">KS00 (Auto-computed)</label>
              <input type="text" value={(arrayInputs.KS00 || []).map(val => Number(val ?? 0).toFixed(5)).join(', ')} readOnly className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-700 text-sm cursor-not-allowed" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">TS00 (Auto-computed)</label>
              <input
                type="text"
                value={(arrayInputs.TS00 || []).map(val => {
                  const num = Number(val);
                  return isNaN(num) ? '' : num.toFixed(5);
                }).join(', ')}
                readOnly
                className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-700 text-sm cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Number of flap elements (NELMNT)</label>
              <select name="NELMNT" value={formData.NELMNT} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 text-sm">
                <option value="0">Flaps Up</option>
                <option value="1">Single Flap</option>
                <option value="2">Double Flaps</option>
              </select>
            </div>
          </div>
          <div className="space-y-3 pt-4 border-t border-gray-200">
            <button type="submit" className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-base transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
              Compute ProWiM Analysis
            </button>
            <button type="button" onClick={() => navigate('/post-processing')} className="w-full px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold text-base transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2">
              Back to Post-Processing
            </button>
          </div>
          {result && Array.isArray(result) && (
            <div className="pt-4 border-t border-gray-200">
              <h3 className="text-base font-semibold text-gray-800 mb-2">Computation Results</h3>
              <div className="overflow-x-auto mb-4">
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm min-w-full">
                  <table className="w-full text-xs">
                    <thead className="bg-gradient-to-r from-blue-500 to-blue-600 text-white">
                      <tr>
                        <th className="px-2 py-2 text-center font-semibold">Set</th>
                        <th className="px-2 py-2 text-center font-semibold">ALFAWI</th>
                        <th className="px-2 py-2 text-center font-semibold">KS00</th>
                        <th className="px-2 py-2 text-center font-semibold">ThetaS</th>
                        <th className="px-2 py-2 text-center font-semibold">CL0</th>
                        <th className="px-2 py-2 text-center font-semibold">CD0</th>
                        <th className="px-2 py-2 text-center font-semibold">
                          <div className="flex flex-col items-center gap-1">
                            <span>CL_Prop</span>
                            <select
                              value={clResultKey}
                              onChange={e => setClResultKey(e.target.value)}
                              onClick={e => e.stopPropagation()}
                              className="text-xs font-normal text-gray-800 bg-white border border-blue-300 rounded px-1 py-0.5 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-400"
                            >
                              {CL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          </div>
                        </th>
                        <th className="px-2 py-2 text-center font-semibold">
                          <div className="flex flex-col items-center gap-1">
                            <span>CD_Prop</span>
                            <select
                              value={cdResultKey}
                              onChange={e => setCdResultKey(e.target.value)}
                              onClick={e => e.stopPropagation()}
                              className="text-xs font-normal text-gray-800 bg-white border border-blue-300 rounded px-1 py-0.5 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-400"
                            >
                              {CD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.map((res, index) => (
                        <tr key={index} className={`transition-colors duration-200 hover:bg-blue-50 ${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}`}>
                          <td className="px-2 py-2 text-center font-medium text-gray-900 bg-gray-100">{index + 1}</td>
                          <td className="px-2 py-2 text-center text-gray-700">{arrayInputs.ALFAWI[index] != null ? roundAngle(arrayInputs.ALFAWI[index]).toFixed(2) : 'N/A'}</td>
                          <td className="px-2 py-2 text-center text-gray-700">{arrayInputs.KS00[index] != null ? roundOther(arrayInputs.KS00[index]).toFixed(3) : 'N/A'}</td>
                          <td className="px-2 py-2 text-center text-gray-700">{res.theta_s != null ? roundAngle(res.theta_s).toFixed(2) : 'N/A'}</td>
                          <td className="px-2 py-2 text-center text-gray-700">{arrayInputs.CL0[index] != null ? roundOther(arrayInputs.CL0[index]).toFixed(3) : 'N/A'}</td>
                          <td className="px-2 py-2 text-center text-gray-700">{cd0Display[index] != null ? roundOther(cd0Display[index]).toFixed(3) : 'N/A'}</td>
                          <td className="px-2 py-2 text-center font-medium text-blue-600">{res[clResultKey] != null ? roundOther(res[clResultKey]).toFixed(3) : 'N/A'}</td>
                          <td className="px-2 py-2 text-center font-medium text-red-600">{res[cdResultKey] != null ? roundOther(Math.abs(res[cdResultKey])).toFixed(3) : 'N/A'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <button onClick={handlePlotResults} className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold text-base transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2">
                  📊 Plot Results
                </button>
                <select onChange={handleExportDropdown} className="w-full px-4 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-semibold cursor-pointer transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 text-base">
                  <option value="">📥 Export Results</option>
                  <option value="csv">Export as CSV</option>
                  <option value="txt">Export as TXT</option>
                </select>
              </div>
            </div>
          )}
        </form>
      </div>
      {/* Right Panel: Plots / 3D Model */}
      <div className="flex-1 flex flex-col bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">
            {showPlots ? 'Analysis Results' : '3D Wing-Propeller Model'}
          </h2>
          {showPlots && (
            <button
              onClick={handleBackToModel}
              className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium text-sm transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-gray-300"
            >
              Back to 3D Model
            </button>
          )}
        </div>
        <div className="flex-1 overflow-hidden">
          {showPlots && clPlot && cdPlot ? (
            <div className="h-full p-4 overflow-auto">
              <div className="flex flex-col gap-4 h-full">
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm w-full" style={{ minHeight: 420 }}>
                  <h4 className="text-base font-semibold text-gray-800 mb-3 text-center">Lift ({clResultKey}) vs Angle of Attack</h4>
                  <div className="w-full" style={{ height: 320 }}>
                    <Plot
                      data={clPlot}
                      layout={getCLChartLayout()}
                      useResizeHandler
                      style={{ width: '100%', height: '100%' }}
                      config={{ responsive: true, displayModeBar: false }}
                    />
                  </div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm w-full" style={{ minHeight: 420 }}>
                  <h4 className="text-base font-semibold text-gray-800 mb-3 text-center">Drag ({cdResultKey}) vs Angle of Attack</h4>
                  <div className="w-full" style={{ height: 320 }}>
                    <Plot
                      data={cdPlot}
                      layout={getCDChartLayout()}
                      useResizeHandler
                      style={{ width: '100%', height: '100%' }}
                      config={{ responsive: true, displayModeBar: false }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full h-full">
              <Prowim3Dmodel
                bOverD={parseFloat(formData.bOverD)}
                cOverD={parseFloat(formData.cOverD)}
                D={parseFloat(formData.D)}
                propLocation={parseFloat(formData.propLocation)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default PropellerWingForm;

import React, { useState, useEffect } from "react";
import Prowim3Dmodel from "./Prowim3Dmodel";
import { useNavigate, useLocation } from "react-router-dom";
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

import { fetchAPI } from '../utils/fetch';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

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

function PropellerWingForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const [showPlots, setShowPlots] = useState(false);
  const [isPolarPanelOpen, setIsPolarPanelOpen] = useState(true);
  const [csvFiles, setCsvFiles] = useState([]);
  const [selectedCsvFile, setSelectedCsvFile] = useState(null);
  const [polarData, setPolarData] = useState(null);
  const [simulationData, setSimulationData] = useState(null);

  const [formData, setFormData] = useState({
    A: "8",
    bOverD: "6.0",
    cOverD: "0.75",
    alpha0: "-2",
    N: "4",
    NSPSW: "0.698",
    ZPD: "-0.1",
    IW: "2",
    NELMNT: "0",
    CTIP: "0.3",
    NAW: "1",
    ALFAWI: "5",
    CL0: "0.5",
    CD0: "0.0230",
    KS00: "0.001",
    propLocation: "0.5",
    D: "3"
  });

  const [arrayInputs, setArrayInputs] = useState({
    ALFAWI: [5],
    CL0: [0.5],
    CD0: [0.0230],
    KS00: [0.001]
  });

  // Process simulation data when component mounts or location state changes
  useEffect(() => {
    console.log('ProWiM Location state received:', location.state);

    if (location.state && location.state.simulationFolder) {
      const receivedData = location.state.simulationFolder;
      let finalData = null;

      if (receivedData.data) {
        finalData = receivedData.data;
      } else {
        finalData = receivedData;
      }

      setSimulationData(finalData);
      scanForCsvFiles(finalData);
    }
  }, [location.state]);

  // Scan for CSV files in the simulation folder
  const scanForCsvFiles = (simData) => {
    if (!simData || !simData.files) {
      console.log('No simulation data or files found');
      setCsvFiles([]);
      return;
    }

    const files = simData.files;
    let csvFileList = [];

    // Check if files is an array or object
    if (Array.isArray(files)) {
      csvFileList = files.filter(file =>
        file.name && file.name.toLowerCase().endsWith('.csv')
      );
    } else if (typeof files === 'object') {
      // Check in different file type categories
      Object.values(files).forEach(fileTypeArray => {
        if (Array.isArray(fileTypeArray)) {
          const csvs = fileTypeArray.filter(file =>
            file.name && file.name.toLowerCase().endsWith('.csv')
          );
          csvFileList = csvFileList.concat(csvs);
        }
      });

      // Also check if there's a direct 'csv' category
      if (files.csv && Array.isArray(files.csv)) {
        csvFileList = csvFileList.concat(files.csv);
      }

      // Check 'other' category for CSV files
      if (files.other && Array.isArray(files.other)) {
        const csvs = files.other.filter(file =>
          file.name && file.name.toLowerCase().endsWith('.csv')
        );
        csvFileList = csvFileList.concat(csvs);
      }
    }

    console.log('Found CSV files:', csvFileList);
    setCsvFiles(csvFileList);
  };

  // Fetch CSV file content from server
  const fetchCsvFile = async (file) => {
    try {
      console.log('Fetching CSV file:', file);

      const simName = simulationData?.simName || 'unknown';
      console.log('Using simulation name:', simName);
      console.log('File path:', file.path);

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

      console.log('Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Server error response:', errorText);
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }

      const content = await response.text();
      console.log('CSV file content fetched successfully, length:', content.length);
      return content;

    } catch (error) {
      console.error('Error fetching CSV file content:', error);

      if (error.message.includes('Failed to fetch')) {
        alert(`Network error loading file ${file.name}. Please check if the backend server is running on http://127.0.0.1:5000`);
      } else if (error.message.includes('404')) {
        alert(`File ${file.name} not found on server.`);
      } else {
        alert(`Error loading file ${file.name}: ${error.message}`);
      }
      return null;
    }
  };

  // Parse CSV content for polar data
  const parseCsvContent = (content) => {
    try {
      const lines = content.split('\n').map(line => line.trim()).filter(line => line);

      if (lines.length === 0) {
        throw new Error('CSV file is empty');
      }

      // Find header line (look for Alpha, CL, CD columns)
      let headerIndex = -1;
      let alphaIndex = -1;
      let clIndex = -1;
      let cdIndex = -1;

      for (let i = 0; i < Math.min(5, lines.length); i++) {
        const headers = lines[i].split(/[,;\t]/).map(h => h.trim().toLowerCase());

        // Look for column indices
        alphaIndex = headers.findIndex(h =>
          h.includes('alpha') || h.includes('angle') || h.includes('aoa') || h === 'α'
        );
        clIndex = headers.findIndex(h =>
          h.includes('cl') || h.toLowerCase() === 'lift'
        );
        cdIndex = headers.findIndex(h =>
          h.includes('cd') || h.toLowerCase() === 'drag'
        );

        if (alphaIndex !== -1 && clIndex !== -1 && cdIndex !== -1) {
          headerIndex = i;
          break;
        }
      }

      if (headerIndex === -1) {
        throw new Error('Could not find Alpha, CL, and CD columns in CSV file');
      }

      // Parse data rows
      const dataRows = lines.slice(headerIndex + 1);
      const polarData = {
        alpha: [],
        cl: [],
        cd: []
      };

      dataRows.forEach((line, index) => {
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

      if (polarData.alpha.length === 0) {
        throw new Error('No valid data rows found in CSV file');
      }

      console.log('Parsed polar data:', polarData);
      return polarData;

    } catch (error) {
      console.error('Error parsing CSV content:', error);
      alert(`Error parsing CSV file: ${error.message}`);
      return null;
    }
  };

  // Handle CSV file selection
  const handleCsvFileSelect = async (file) => {
    setSelectedCsvFile(file);

    let content = null;

    if (file.file) {
      // From folder import - has actual File object
      try {
        content = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.onerror = (e) => reject(e);
          reader.readAsText(file.file);
        });
      } catch (error) {
        console.error('Error reading local CSV file:', error);
        alert(`Error reading CSV file: ${error.message}`);
        return;
      }
    } else {
      // From server - need to fetch content
      content = await fetchCsvFile(file);
      if (!content) return;
    }

    // Parse the CSV content
    const parsed = parseCsvContent(content);
    if (parsed) {
      setPolarData(parsed);

      // Auto-populate form fields
      setArrayInputs(prev => ({
        ...prev,
        ALFAWI: parsed.alpha,
        CL0: parsed.cl,
        CD0: parsed.cd
      }));

      // Update display values
      setFormData(prev => ({
        ...prev,
        ALFAWI: parsed.alpha.join(', '),
        CL0: parsed.cl.map(v => v.toFixed(3)).join(', '),
        CD0: parsed.cd.map(v => v.toFixed(4)).join(', ')
      }));

      console.log('Auto-populated form with polar data');
    }
  };

  // Compute KS00 array whenever A, CL0, or CD0 changes
  useEffect(() => {
    const A = parseFloat(formData.A);
    if (A && arrayInputs.CL0.length > 0 && arrayInputs.CD0.length > 0) {
      const newKS00 = arrayInputs.CL0.map((cl0, index) => {
        const cd0 = arrayInputs.CD0[index] || arrayInputs.CD0[0];
        return parseFloat(computeKS0D(cl0, cd0, A));
      });
      setArrayInputs(prev => ({ ...prev, KS00: newKS00 }));
    }
  }, [formData.A, arrayInputs.CL0, arrayInputs.CD0]);

  const [result, setResult] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleArrayChange = (name, value) => {
    // Parse comma-separated AND space-separated values
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
      const payload = {
        ...formData,
        ALFAWI: arrayInputs.ALFAWI,
        CL0: arrayInputs.CL0,
        CD0: arrayInputs.CD0,
        KS00: arrayInputs.KS00
      };

      const response = await fetchAPI("/prowim-compute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json();
        setResult(data.results);
        setShowPlots(false);
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

  const handleExportResults = (format = 'csv') => {
    if (!result || !Array.isArray(result) || result.length === 0) {
      alert("No results to export.");
      return;
    }

    const headers = ['Set', 'ALFAWI', 'CL0', 'CD0', 'KS00', 'CL_Prop', 'CD_Prop'];
    const rows = result.map((res, index) => [
      index + 1,
      arrayInputs.ALFAWI[index]?.toFixed(2) || 'N/A',
      arrayInputs.CL0[index]?.toFixed(3) || 'N/A',
      arrayInputs.CD0[index]?.toFixed(4) || 'N/A',
      arrayInputs.KS00[index]?.toFixed(4) || 'N/A',
      res.CZD?.toFixed(5) || 'N/A',
      res.CXDwf?.toFixed(5) || 'N/A'
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

  // Prepare chart data
  const prepareChartData = () => {
    if (!result || !Array.isArray(result)) return { clData: null, cdData: null };

    const alphaValues = arrayInputs.ALFAWI;
    const clValues = result.map(res => res.CZD);
    const cdValues = result.map(res => Math.abs(res.CXDwf));
    const cl0Values = arrayInputs.CL0;
    const cd0Values = arrayInputs.CD0;

    const clData = {
      labels: alphaValues,
      datasets: [
        {
          label: 'CL_Prop (Computed)',
          data: clValues,
          borderColor: 'rgb(75, 192, 192)',
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
          tension: 0.1,
        },
        {
          label: 'CL0 (Input)',
          data: cl0Values,
          borderColor: 'rgb(54, 162, 235)',
          backgroundColor: 'rgba(54, 162, 235, 0.2)',
          borderDash: [5, 5],
          tension: 0.1,
        },
      ],
    };

    const cdData = {
      labels: alphaValues,
      datasets: [
        {
          label: 'CD_Prop (Computed)',
          data: cdValues,
          borderColor: 'rgb(255, 99, 132)',
          backgroundColor: 'rgba(255, 99, 132, 0.2)',
          tension: 0.1,
        },
        {
          label: 'CD0 (Input)',
          data: cd0Values,
          borderColor: 'rgb(255, 159, 64)',
          backgroundColor: 'rgba(255, 159, 64, 0.2)',
          borderDash: [5, 5],
          tension: 0.1,
        },
      ],
    };

    return { clData, cdData };
  };

  const { clData, cdData } = prepareChartData();

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: 'Aerodynamic Coefficients vs Angle of Attack',
      },
    },
    scales: {
      x: {
        title: {
          display: true,
          text: 'Angle of Attack (degrees)',
        },
        ticks: {
          callback: function (value, index, values) {
            return Number(this.getLabelForValue(value)).toFixed(3);
          }
        }
      },
      y: {
        title: {
          display: true,
          text: 'Coefficient Value',
        },
      },
    },
  };

  // Render polar data panel
  const renderPolarPanel = () => {
    return (
      <div className={`fixed left-0 top-0 h-screen bg-white border-r border-blue-200 shadow-lg z-50 transition-all duration-300 overflow-y-auto ${isPolarPanelOpen ? 'w-80' : 'w-12'
        }`}>
        <div className="flex items-center justify-between p-4 bg-blue-50 border-b border-blue-200 min-h-[60px]">
          {isPolarPanelOpen && (
            <h3 className="text-lg font-semibold text-gray-800">Polar Data</h3>
          )}
          <button
            className="p-2 hover:bg-blue-100 rounded-lg transition-colors duration-200 text-gray-600"
            onClick={() => setIsPolarPanelOpen(!isPolarPanelOpen)}
          >
            {isPolarPanelOpen ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            )}
          </button>
        </div>

        {isPolarPanelOpen && (
          <div className="p-4">
            {csvFiles.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-gray-400 mb-4">
                  <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-gray-600 font-medium">No Polars found</p>
                <p className="text-sm text-gray-500 mt-1">No CSV files detected in the simulation folder</p>
              </div>
            ) : (
              <div>
                <h4 className="text-sm font-semibold text-gray-800 mb-3">Available CSV Files:</h4>
                <div className="space-y-2">
                  {csvFiles.map((file, index) => (
                    <div
                      key={index}
                      className={`flex items-center p-3 border rounded-lg cursor-pointer transition-all duration-200 hover:bg-blue-50 hover:border-blue-300 ${selectedCsvFile?.name === file.name
                        ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-200'
                        : 'border-gray-200'
                        }`}
                      onClick={() => handleCsvFileSelect(file)}
                      title={file.name}
                    >
                      <span className="text-lg mr-3">📊</span>
                      <span className="flex-1 text-sm font-medium text-gray-800 truncate">{file.name}</span>
                      {selectedCsvFile?.name === file.name && (
                        <span className="text-green-600 font-bold">✓</span>
                      )}
                    </div>
                  ))}
                </div>

                {polarData && (
                  <div className="mt-6 p-4 bg-green-50 rounded-lg border-l-4 border-green-400">
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
            )}
          </div>
        )}
      </div>
    );
  };
  // ...existing imports and logic code stays the same...

  return (
    <div className="flex h-screen bg-blue-50 font-sans">
      {/* Polar Data Panel */}
      {renderPolarPanel()}

      {/* Main Content - Responsive Layout */}
      <div className={`flex-1 flex flex-col lg:flex-row transition-all duration-300 ${isPolarPanelOpen ? 'ml-80' : 'ml-12'
        }`}>

        {/* Form Container - Priority on mobile, flexible on desktop */}
        <div className="w-full lg:w-96 xl:w-[28rem] 2xl:w-[32rem] bg-white m-2 lg:m-4 rounded-xl shadow-lg overflow-y-auto order-2 lg:order-1 flex-shrink-0">
          <div className="p-3 lg:p-4 border-b border-gray-200 bg-gray-50">
            <h2 className="text-lg lg:text-xl font-semibold text-gray-800">ProWiM Configuration</h2>
          </div>

          <form onSubmit={handleSubmit} className="p-4 lg:p-6 space-y-4 lg:space-y-5">
            {/* Basic Parameters Grid - Responsive */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-4">
              {[
                { label: "Wing Aspect Ratio (A)", name: "A", span: false },
                { label: "b / D", name: "bOverD", span: false },
                { label: "c / D", name: "cOverD", span: false },
                { label: "Angle of attack at zero lift (α₀) [deg]", name: "alpha0", span: true },
                { label: "Total number of propellers (N)", name: "N", span: false },
                { label: "NSPSW", name: "NSPSW", span: false },
                { label: "ZPD", name: "ZPD", span: false },
                { label: "IW [deg]", name: "IW", span: false },
                { label: "Thrust Coefficient (CTIP)", name: "CTIP", span: true },
                { label: "Propeller Location along Wing Span (y/b)", name: "propLocation", span: true },
                { label: "Propeller Diameter (D) [m]", name: "D", span: true }
              ].map(({ label, name, span }) => (
                <div key={name} className={span ? "sm:col-span-2" : ""}>
                  <label className="block text-xs lg:text-sm font-medium text-gray-700 mb-1 lg:mb-2">{label}</label>
                  <input
                    type="number"
                    step="any"
                    name={name}
                    value={formData[name]}
                    onChange={handleChange}
                    required
                    className="w-full px-3 lg:px-4 py-2 lg:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 text-sm lg:text-base transition-colors duration-200"
                  />
                </div>
              ))}
            </div>

            {/* Array Inputs - Responsive spacing */}
            <div className="space-y-3 lg:space-y-5 pt-4 lg:pt-5 border-t border-gray-200">
              <h3 className="text-base lg:text-lg font-semibold text-gray-800">Flight Conditions</h3>

              <div>
                <label className="block text-xs lg:text-sm font-medium text-gray-700 mb-1 lg:mb-2">
                  ALFAWI [deg]
                  {polarData && <span className="ml-2 px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">📊 Auto-filled</span>}
                </label>
                <input
                  type="text"
                  name="ALFAWI"
                  value={formData.ALFAWI}
                  onChange={(e) => handleArrayChange("ALFAWI", e.target.value)}
                  placeholder="0, 5, 10"
                  required
                  className="w-full px-3 lg:px-4 py-2 lg:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 text-sm lg:text-base transition-colors duration-200"
                />
                <p className="text-xs lg:text-sm text-gray-500 mt-1 lg:mt-2">Current values: [{arrayInputs.ALFAWI.map(val => val.toFixed(2)).join(', ')}]</p>
              </div>

              <div>
                <label className="block text-xs lg:text-sm font-medium text-gray-700 mb-1 lg:mb-2">
                  CL0
                  {polarData && <span className="ml-2 px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">📊 Auto-filled</span>}
                </label>
                <input
                  type="text"
                  name="CL0"
                  value={formData.CL0}
                  onChange={(e) => handleArrayChange("CL0", e.target.value)}
                  placeholder="0.5, 0.6, 0.7"
                  required
                  className="w-full px-3 lg:px-4 py-2 lg:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 text-sm lg:text-base transition-colors duration-200"
                />
                <p className="text-xs lg:text-sm text-gray-500 mt-1 lg:mt-2">Current values: [{arrayInputs.CL0.map(val => val.toFixed(3)).join(', ')}]</p>
              </div>

              <div>
                <label className="block text-xs lg:text-sm font-medium text-gray-700 mb-1 lg:mb-2">
                  CD0
                  {polarData && <span className="ml-2 px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">📊 Auto-filled</span>}
                </label>
                <input
                  type="text"
                  name="CD0"
                  value={formData.CD0}
                  onChange={(e) => handleArrayChange("CD0", e.target.value)}
                  placeholder="0.02, 0.025, 0.03"
                  required
                  className="w-full px-3 lg:px-4 py-2 lg:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 text-sm lg:text-base transition-colors duration-200"
                />
                <p className="text-xs lg:text-sm text-gray-500 mt-1 lg:mt-2">Current values: [{arrayInputs.CD0.map(val => val.toFixed(3)).join(', ')}]</p>
              </div>

              <div>
                <label className="block text-xs lg:text-sm font-medium text-gray-700 mb-1 lg:mb-2">KS00 (Auto-computed)</label>
                <input
                  type="text"
                  value={arrayInputs.KS00.map(val => val.toFixed(5)).join(', ')}
                  readOnly
                  className="w-full px-3 lg:px-4 py-2 lg:py-3 bg-gray-100 border border-gray-300 rounded-lg text-gray-700 text-sm lg:text-base cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs lg:text-sm font-medium text-gray-700 mb-1 lg:mb-2">Number of flap elements (NELMNT)</label>
                <select
                  name="NELMNT"
                  value={formData.NELMNT}
                  onChange={handleChange}
                  className="w-full px-3 lg:px-4 py-2 lg:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 text-sm lg:text-base transition-colors duration-200"
                >
                  <option value="0">Flaps Up</option>
                  <option value="1">Single Flap</option>
                  <option value="2">Double Flaps</option>
                </select>
              </div>
            </div>

            {/* Action Buttons - Responsive */}
            <div className="space-y-3 lg:space-y-4 pt-4 lg:pt-5 border-t border-gray-200">
              <button
                type="submit"
                className="w-full px-4 lg:px-6 py-3 lg:py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-base lg:text-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Compute ProWiM Analysis
              </button>
              <button
                type="button"
                onClick={() => navigate('/post-processing')}
                className="w-full px-4 lg:px-6 py-3 lg:py-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold text-base lg:text-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2"
              >
                Back to Post-Processing
              </button>
            </div>
          </form>

          {/* Results Section - Responsive */}
          {result && Array.isArray(result) && (
            <div className="p-4 lg:p-6 border-t border-gray-200 bg-gray-50">
              <h3 className="text-base lg:text-lg font-semibold text-gray-800 mb-4 lg:mb-5">Computation Results</h3>

              {/* Results Table - Responsive */}
              <div className="overflow-x-auto mb-4 lg:mb-5">
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm min-w-full">
                  <table className="w-full text-xs lg:text-sm">
                    <thead className="bg-gradient-to-r from-blue-500 to-blue-600 text-white">
                      <tr>
                        <th className="px-2 lg:px-4 py-2 lg:py-4 text-center font-semibold">Set</th>
                        <th className="px-2 lg:px-4 py-2 lg:py-4 text-center font-semibold">ALFAWI</th>
                        <th className="px-2 lg:px-4 py-2 lg:py-4 text-center font-semibold">KS00</th>
                        <th className="px-2 lg:px-4 py-2 lg:py-4 text-center font-semibold">CL0</th>
                        <th className="px-2 lg:px-4 py-2 lg:py-4 text-center font-semibold">CD0</th>
                        <th className="px-2 lg:px-4 py-2 lg:py-4 text-center font-semibold">CL_Prop</th>
                        <th className="px-2 lg:px-4 py-2 lg:py-4 text-center font-semibold">CD_Prop</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.map((res, index) => (
                        <tr key={index} className={`transition-colors duration-200 hover:bg-blue-50 ${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'
                          }`}>
                          <td className="px-2 lg:px-4 py-2 lg:py-4 text-center font-medium text-gray-900 bg-gray-100">{index + 1}</td>
                          <td className="px-2 lg:px-4 py-2 lg:py-4 text-center text-gray-700">{arrayInputs.ALFAWI[index]?.toFixed(2) || 'N/A'}</td>
                          <td className="px-2 lg:px-4 py-2 lg:py-4 text-center text-gray-700">{arrayInputs.KS00[index]?.toFixed(4) || 'N/A'}</td>
                          <td className="px-2 lg:px-4 py-2 lg:py-4 text-center text-gray-700">{arrayInputs.CL0[index]?.toFixed(3) || 'N/A'}</td>
                          <td className="px-2 lg:px-4 py-2 lg:py-4 text-center text-gray-700">{arrayInputs.CD0[index]?.toFixed(4) || 'N/A'}</td>
                          <td className="px-2 lg:px-4 py-2 lg:py-4 text-center font-medium text-blue-600">{res.CZD?.toFixed(5) || 'N/A'}</td>
                          <td className="px-2 lg:px-4 py-2 lg:py-4 text-center font-medium text-red-600">{Math.abs(res.CXDwf).toFixed(5) || 'N/A'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Action Buttons - Responsive */}
              <div className="flex flex-col gap-3 lg:gap-4">
                <button
                  onClick={handlePlotResults}
                  className="w-full px-4 lg:px-6 py-3 lg:py-4 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold text-base lg:text-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                >
                  📊 Plot Results
                </button>

                <select
                  onChange={handleExportDropdown}
                  className="w-full px-4 lg:px-6 py-3 lg:py-4 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-semibold cursor-pointer transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 text-base lg:text-lg"
                >
                  <option value="">📥 Export Results</option>
                  <option value="csv">Export as CSV</option>
                  <option value="txt">Export as TXT</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* 3D Model / Plots Area - Takes remaining space */}
        <div className="flex-1 bg-white m-2 lg:m-4 rounded-xl shadow-lg overflow-hidden order-1 lg:order-2 min-h-0">
          {!showPlots ? (
            <div className="h-full flex flex-col">
              <div className="p-3 lg:p-4 border-b border-gray-200 bg-gray-50 flex-shrink-0">
                <h2 className="text-lg lg:text-xl font-semibold text-gray-800">3D Wing-Propeller Model</h2>
              </div>
              <div className="flex-1 p-2 lg:p-4 min-h-0">
                <Prowim3Dmodel
                  bOverD={parseFloat(formData.bOverD)}
                  cOverD={parseFloat(formData.cOverD)}
                  D={parseFloat(formData.D)}
                  propLocation={parseFloat(formData.propLocation)}
                />
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col">
              <div className="p-3 lg:p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between flex-shrink-0">
                <h2 className="text-lg lg:text-xl font-semibold text-gray-800">Analysis Results</h2>
                <button
                  onClick={handleBackToModel}
                  className="px-3 lg:px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium text-sm lg:text-base transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-gray-300"
                >
                  <span className="hidden sm:inline">Back to 3D Model</span>
                  <span className="sm:hidden">Back</span>
                </button>
              </div>
              <div className="flex-1 p-2 lg:p-4 overflow-auto min-h-0">
                {clData && cdData && (
                  <div className="space-y-4 lg:space-y-6 h-full">
                    <div className="bg-white p-3 lg:p-4 rounded-xl border border-gray-200 shadow-sm flex-1 min-h-0">
                      <h4 className="text-base lg:text-lg font-semibold text-gray-800 mb-2 lg:mb-3 text-center">CL vs Angle of Attack</h4>
                      <div className="h-64 lg:h-80 xl:h-96">
                        <Line data={clData} options={chartOptions} />
                      </div>
                    </div>
                    <div className="bg-white p-3 lg:p-4 rounded-xl border border-gray-200 shadow-sm flex-1 min-h-0">
                      <h4 className="text-base lg:text-lg font-semibold text-gray-800 mb-2 lg:mb-3 text-center">CD vs Angle of Attack</h4>
                      <div className="h-64 lg:h-80 xl:h-96">
                        <Line data={cdData} options={chartOptions} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

}

export default PropellerWingForm;
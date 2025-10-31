import { useState, useEffect, useRef, useContext } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LogarithmicScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import FormDataContext from "./FormDataContext";

import { createSocket } from '../utils/socket';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  LogarithmicScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

// Generate a large palette of distinct colors for up to 50 runs
function generateColorPalette(n) {
  const palette = [];
  for (let i = 0; i < n; i++) {
    // Use HSL for visually distinct colors
    palette.push(`hsl(${(i * 360) / n}, 70%, 50%)`);
  }
  return palette;
}
const RUN_COLORS = generateColorPalette(60);

const SimulationRun = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [socket, setSocket] = useState(null);
  const [newRunStarted, setNewRunStarted] = useState(false);

  // residualRuns: an array of runs. Each run is { id, iterations: [], residuals: [], color }
  const [residualRuns, setResidualRuns] = useState([
    { id: 0, iterations: [], residuals: [], color: RUN_COLORS[0] },
  ]);
  const [currentRunIndex, setCurrentRunIndex] = useState(0);
  const currentRunIndexRef = useRef(0);

  const [simulationName, setSimulationName] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [simulationComplete, setSimulationComplete] = useState(false);
  const { formData } = useContext(FormDataContext);
  const messageBoxRef = useRef(null);

  const parseResidualData = (message) => {
    if (!message) return;

    const lower = message.toLowerCase();

    // Detect "[ALL DONE]" marker only
    const doneMarker = "[all done]";
    if (lower.includes(doneMarker)) {
      console.log("New simulation run detected after '[ALL DONE]'.");
      setResidualRuns((prevRuns) => {
        const nextIndex = prevRuns.length;
        const nextColor = RUN_COLORS[nextIndex % RUN_COLORS.length];
        const newRuns = [
          ...prevRuns,
          { id: Date.now(), iterations: [], residuals: [], color: nextColor }
        ];
        currentRunIndexRef.current = nextIndex;
        setCurrentRunIndex(nextIndex);
        return newRuns;
      });
      setNewRunStarted(true);
      // Do not return here -- we still may get additional info in same message,
      // so continue to attempt parsing numbers below.
    }

    // Pattern to match the format: [number] [iteration] [residual]
    const residualPattern = /^\s*\d+\s+(\d+)\s*(-?[\d.eE+-]+)\s*$/i;
    const match = message.match(residualPattern);

    if (match) {
      const iteration = parseInt(match[1], 10);
      const residual = parseFloat(match[2]);

      if (!isNaN(iteration) && !isNaN(residual)) {
        const absResidual = Math.abs(residual);
        // Always append to the latest run only
        setResidualRuns((prev) => {
          const idx = prev.length - 1;
          const next = prev.map((r, i) =>
            i === idx
              ? {
                ...r,
                iterations: [...r.iterations, iteration],
                residuals: [...r.residuals, absResidual],
              }
              : r
          );
          return next;
        });
        setNewRunStarted(false);
      }
    }

    // Check if simulation is complete (existing logic)
    if (
      lower.includes("solver complete") ||
      lower.includes("simulation complete") ||
      lower.includes("finished")
    ) {
      setSimulationComplete(true);
    }
  };

  useEffect(() => {
    if (!formData) {
      console.error("Error: No form data available in SimulationRun component.");
      return;
    }

    const newSocket = createSocket({
      pingTimeout: 300000,
      pingInterval: 60000
    });

    newSocket.on("connect", () => {
      console.log("WebSocket connected");
      const formObject = Object.fromEntries(formData.entries());
      const simName = formObject.simName;
      setSimulationName(simName);
      console.log("Stored simulation name:", simName);
      newSocket.emit("start_simulation", formObject);
    });

    newSocket.on("message", (data) => {
      setMessages((prev) => [...prev, data]);
      parseResidualData(data);
    });

    newSocket.on("download_ready", ({ fileData, simName }) => {
      setIsDownloading(false);
      if (fileData) {
        const blob = new Blob([fileData], { type: "application/zip" });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${simName}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }
    });

    newSocket.on("simulation_folder_ready", (folderData) => {
      setIsExporting(false);
      console.log("Simulation folder data received:", folderData);

      if (folderData && folderData.success) {
        navigate('/post-processing', {
          state: {
            simulationFolder: folderData.data,
            simName: folderData.simName
          }
        });
      } else {
        console.error('Failed to get simulation folder data:', folderData?.error || 'Unknown error');
        alert('Failed to export simulation data. Please try again.');
      }
    });

    newSocket.on("error", (errorData) => {
      console.error("Socket error:", errorData);
      setIsDownloading(false);
      setIsExporting(false);
      if (errorData.type === 'simulation_folder_error') {
        alert('Error exporting simulation data: ' + (errorData.message || 'Unknown error'));
      }
    });

    newSocket.on("disconnect", () => {
      console.log("WebSocket disconnected");
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
      console.log("WebSocket cleanup: Disconnected on component unmount");
    };
  }, [formData, navigate]);

  useEffect(() => {
    if (messageBoxRef.current) {
      messageBoxRef.current.scrollTop = messageBoxRef.current.scrollHeight;
    }
  }, [messages]);

  const handleDownload = () => {
    if (!simulationName) {
      console.error("Error: Simulation name not available.");
      alert("Simulation name not available. Please restart the simulation.");
      return;
    }

    if (socket) {
      setIsDownloading(true);
      socket.emit("download", { simName: simulationName });
      console.log("Download request sent via WebSocket");
    }
  };

  const handleExportToVFPPost = () => {
    if (!simulationName) {
      console.error("Error: Simulation name not available.");
      alert("Simulation name not available. Please restart the simulation.");
      return;
    }

    if (socket) {
      setIsExporting(true);
      console.log("Requesting simulation folder via WebSocket for:", simulationName);
      socket.emit("get_simulation_folder", { simName: simulationName });
    } else {
      console.error("Socket connection not available");
      alert('Connection error. Please try again.');
    }
  };

  const handleClose = () => {
    if (socket) {
      socket.disconnect();
      console.log("WebSocket explicitly disconnected on close button click");
    }
    navigate(-1);
  };

  // Build Chart datasets from residualRuns. Each run is a separate dataset.
  const chartData = {
    datasets: residualRuns.map((run, idx) => ({
      label: idx === 0 ? "Residuals" : `Residuals (cont ${idx})`,
      data: run.iterations.map((it, i) => ({ x: it, y: run.residuals[i] })),
      borderColor: run.color,
      backgroundColor: run.color,
      tension: 0.3,
      pointRadius: 4,
      pointHoverRadius: 7,
      borderWidth: 1,
      pointBackgroundColor: run.color,
      pointBorderColor: "#ffffff",
      pointBorderWidth: 0.8,
      showLine: run.iterations.length > 1, // Only join points within the same run
      spanGaps: false, // Do not join across runs
      fill: false,
    })),
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    layout: {
      padding: {
        top: 10,
        right: 15,
        bottom: 10,
        left: 15,
      },
    },
    plugins: {
      legend: {
        position: "top",
        align: "start",
        labels: {
          color: "#374151",
          font: {
            size: 12,
            weight: "500",
          },
          usePointStyle: true,
          boxWidth: 8,
          padding: 12,
        },
      },
      title: {
        display: false,
      },
      tooltip: {
        backgroundColor: "rgba(31, 41, 55, 0.95)",
        titleColor: "#ffffff",
        bodyColor: "#ffffff",
        borderColor: "#6b7280",
        borderWidth: 1,
        cornerRadius: 8,
        displayColors: false,
        callbacks: {
          title: function (context) {
            const it = context[0]?.raw?.x ?? context[0]?.label;
            return `Iteration ${it}`;
          },
          label: function (context) {
            const y = context.parsed?.y ?? context.raw?.y;
            if (typeof y === "number") return `Residual: ${y.toExponential(3)}`;
            return `Residual: ${y}`;
          },
        },
      },
    },
    scales: {
      x: {
        type: "linear",
        display: true,
        title: {
          display: true,
          text: "Iterations",
          color: "#374151",
          font: {
            size: 12,
            weight: "500",
          },
          padding: { top: 5 },
        },
        ticks: {
          color: "#6b7280",
          font: {
            size: 11,
          },
          autoSkip: true,
          maxTicksLimit: 8,
          padding: 5,
        },
        grid: {
          color: "rgba(229, 231, 235, 0.7)",
          drawBorder: false,
          lineWidth: 1,
        },
      },
      y: {
        display: true,
        title: {
          display: true,
          text: "Residuals",
          color: "#374151",
          font: {
            size: 12,
            weight: "500",
          },
          padding: { bottom: 5 },
        },
        type: "linear",
        min: -0.0001,
        ticks: {
          color: "#6b7280",
          font: {
            size: 11,
          },
          padding: 5,
          callback: function (value) {
            if (value >= 1e-1) return value.toFixed(1);
            if (value >= 1e-3) return value.toExponential(0);
            return value.toExponential(1);
          },
        },
        grid: {
          color: "rgba(229, 231, 235, 0.7)",
          drawBorder: false,
          lineWidth: 1,
        },
      },
    },
    animation: {
      duration: 200,
    },
    interaction: {
      intersect: false,
      mode: "index",
    },
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 font-sans">
      {/* Header Section */}
      <div className="bg-white/95 backdrop-blur-md shadow-lg border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            {/* Title Section */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full animate-pulse ${simulationComplete ? 'bg-green-500' : 'bg-blue-500'}`}></div>
                <h1 className="text-2xl lg:text-3xl font-bold text-gray-800">
                  VFP Simulation
                  {simulationComplete && (
                    <span className="ml-2 text-green-600 text-lg">✓ Complete</span>
                  )}
                </h1>
              </div>
              {simulationName && (
                <div className="hidden lg:block px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                  {simulationName}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleDownload}
                disabled={isDownloading}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium text-sm transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:transform-none"
              >
                {isDownloading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Downloading...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Download Files
                  </>
                )}
              </button>

              <button
                onClick={handleExportToVFPPost}
                disabled={isExporting}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-lg font-medium text-sm transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:transform-none"
              >
                {isExporting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Exporting...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                    </svg>
                    Export to VFP Post
                  </>
                )}
              </button>

              <button
                onClick={handleClose}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium text-sm transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Close
              </button>
            </div>
          </div>

          {/* Mobile Simulation Name */}
          {simulationName && (
            <div className="lg:hidden mt-3">
              <div className="inline-block px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                {simulationName}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Content - Console narrower, chart wider */}
      <div className="max-w-7xl mx-auto p-4">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-4 h-[calc(100vh-180px)]">
          {/* Console Section */}
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden flex flex-col">
            {/* Console Header */}
            <div className="px-4 py-3 bg-gradient-to-r from-slate-50 to-gray-50 border-b border-gray-200 flex-shrink-0">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Console Output
                </h2>
                <div className="ml-auto flex items-center gap-2">
                  <div className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs font-mono">
                    {messages.length} lines
                  </div>
                </div>
              </div>
            </div>

            {/* Message Box */}
            <div
              className="flex-1 overflow-y-auto p-3 bg-gray-900 text-green-400 font-mono text-sm leading-relaxed min-h-0"
              ref={messageBoxRef}
              style={{
                scrollbarWidth: 'thin',
                scrollbarColor: '#4ade80 #374151'
              }}
            >
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <div className="text-center">
                    <svg className="w-8 h-8 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <p>Waiting for simulation output...</p>
                  </div>
                </div>
              ) : (
                messages.map((msg, index) => {
                  const isComplete = msg.toLowerCase().includes('solver complete') ||
                    msg.toLowerCase().includes('simulation complete') ||
                    msg.toLowerCase().includes('finished');

                  return (
                    <div
                      key={index}
                      className={`mb-1 p-1.5 rounded transition-all duration-200 hover:bg-gray-800 ${isComplete ? 'bg-green-900/50 text-green-300 border-l-4 border-green-400' : ''
                        }`}
                    >
                      <span className="text-gray-500 text-xs mr-2">{String(index + 1).padStart(3, '0')}:</span>
                      {msg}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Chart Section - Wider */}
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden flex flex-col">
            {/* Compact Chart Header */}
            <div className="px-4 py-3 bg-gradient-to-r from-slate-50 to-gray-50 border-b border-gray-200 flex-shrink-0">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2-2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Residuals vs Iterations
                </h2>
              </div>
            </div>

            {/* Chart Container - Fill available space */}
            <div className="flex-1 p-2 bg-white min-h-0">
              <div className="w-full h-full">
                {residualRuns.some(r => r.iterations.length > 0) ? (
                  <div className="w-full h-full">
                    <Line data={chartData} options={chartOptions} />
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-500">
                    <div className="text-center">
                      <svg className="w-10 h-10 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2-2v6a2 2 0 002 2h2a2 2 0 002-2m0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                      <p className="font-medium">Waiting for residual data...</p>
                      <p className="text-sm mt-1 opacity-75">Chart will update automatically</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .min-h-0 {
          min-height: 0;
        }
        /* Custom scrollbar for webkit browsers */
        *::-webkit-scrollbar {
          width: 6px;
        }
        *::-webkit-scrollbar-track {
          background: #374151;
        }
        *::-webkit-scrollbar-thumb {
          background: #4ade80;
          border-radius: 3px;
        }
        *::-webkit-scrollbar-thumb:hover {
          background: #22c55e;
        }
      `}</style>
    </div>
  );

};

export default SimulationRun;
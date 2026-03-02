import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LogarithmicScale,
  PointElement,
  LineElement,
  Decimation,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { useVfpDataContext } from "../store/VfpDataContext";
import { createSocket } from "../utils/socket";


ChartJS.register(
  CategoryScale,
  LinearScale,
  LogarithmicScale,
  Decimation,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
);

// â”€â”€ Palette: 60 distinct hues â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const RUN_COLORS = Array.from({ length: 60 }, (_, i) =>
  `hsl(${Math.round((i * 360) / 60)}, 70%, 55%)`,
);

// â”€â”€ Message classification â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const RESIDUAL_RE = /^\s*\d+\s+\d{3,}[\s-]-?[\d.]+([eE][+-]?\d+)?\s*$/;
const VFP_BAT_RE  = /\[vfp-bat\]/i;

function classifyMessage(msg) {
  if (!msg) return "log";
  if (VFP_BAT_RE.test(msg) || RESIDUAL_RE.test(msg)) return "residual";
  const l = msg.toLowerCase();
  if (/\berror\b/.test(l))    return "error";
  if (/\bwarning\b/.test(l))  return "warning";
  if (/(\[ok\])|solver complete|simulation complete|finished|saved vfp|all done/i.test(msg))
    return "success";
  return "log";
}

const MSG_CLASS = {
  residual: "text-gray-400 font-mono",
  error:    "text-red-700 font-mono font-semibold bg-red-50 border border-red-200 rounded px-1",
  warning:  "text-amber-700 font-mono bg-amber-50 border border-amber-200 rounded px-1",
  success:  "text-emerald-700 font-mono font-semibold bg-emerald-50 border border-emerald-200 rounded px-1",
  log:      "text-gray-700 font-mono",
};

// â”€â”€ Residual line parser (handles "2030-0.0001028" adjacent format) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function parseResidualLine(msg) {
  let m = msg.match(/\[VFP-BAT\]\s+\d+\s+(\d+)-(-?[\d.eE+-]+)/i);
  if (!m) m = msg.match(/\[VFP-BAT\]\s+\d+\s+(\d+)\s+(-?[\d.eE+-]+)/i);
  if (!m) m = msg.match(/^\s*\d+\s+(\d+)-(-?[\d.eE+-]+)\s*$/);
  if (!m) m = msg.match(/^\s*\d+\s+(\d+)\s+(-?[\d.eE+-]+)\s*$/);
  if (!m) return null;
  const iteration = parseInt(m[1], 10);
  const residual  = parseFloat(m[2]);
  if (isNaN(iteration) || isNaN(residual)) return null;
  return { iteration, residual };
}

// â”€â”€ Time formatter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function fmtElapsed(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function fmtResidual(v) {
  if (v == null || isNaN(v)) return "â€”";
  if (v === 0) return "0";
  return v.toExponential(3);
}

// Chart options — light theme, animation disabled, log scale with proper ticks
const CHART_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  parsing: false,
  normalized: true,
  layout: { padding: { top: 8, right: 16, bottom: 8, left: 4 } },
  plugins: {
    decimation: {
      enabled: true,
      algorithm: "lttb",
      samples: 300,
      threshold: 300,
    },
    legend: {
      position: "top",
      align: "start",
      labels: {
        color: "#374151",
        font: { size: 11, weight: "500" },
        usePointStyle: true,
        boxWidth: 8,
        padding: 12,
      },
    },
    tooltip: {
      animation: false,
      backgroundColor: "rgba(255,255,255,0.97)",
      titleColor: "#111827",
      bodyColor: "#374151",
      borderColor: "#d1d5db",
      borderWidth: 1,
      cornerRadius: 6,
      displayColors: false,
      padding: 10,
      callbacks: {
        title: (ctx) => `Iteration ${ctx[0]?.raw?.x ?? "—"}`,
        label: (ctx) => {
          const y = ctx.raw?.y;
          return typeof y === "number"
            ? `|Residual|: ${y.toExponential(4)}`
            : `|Residual|: ${y}`;
        },
      },
    },
    title: { display: false },
  },
  scales: {
    x: {
      type: "linear",
      display: true,
      title: {
        display: true,
        text: "Iterations",
        color: "#374151",
        font: { size: 12, weight: "600" },
        padding: { top: 6 },
      },
      ticks: {
        color: "#4b5563",
        font: { size: 11 },
        maxTicksLimit: 10,
        padding: 4,
      },
      grid: { color: "rgba(209,213,219,0.8)", lineWidth: 1 },
      border: { color: "#9ca3af" },
    },
    y: {
      // Logarithmic — plots |residual| so sign changes never break the axis.
      // Tick callback labels every power of 10 AND the 2x/5x intermediates
      // so there are always visible tick marks regardless of data range.
      type: "logarithmic",
      display: true,
      title: {
        display: true,
        text: "log₁₀ |Residual|",
        color: "#374151",
        font: { size: 12, weight: "600" },
        padding: { bottom: 6 },
      },
      ticks: {
        color: "#4b5563",
        font: { size: 11 },
        maxTicksLimit: 12,
        padding: 6,
        callback(value) {
          const log = Math.log10(value);
          const roundedLog = Math.round(log);
          if (Math.abs(log - roundedLog) < 0.015) {
            return `1e${roundedLog}`;
          }
          const floorPow = Math.pow(10, Math.floor(log));
          const ratio = value / floorPow;
          if (Math.abs(ratio - 2) < 0.06) return `2e${Math.floor(log)}`;
          if (Math.abs(ratio - 5) < 0.06) return `5e${Math.floor(log)}`;
          return null;
        },
      },
      grid: { color: "rgba(209,213,219,0.8)", lineWidth: 1 },
      border: { color: "#9ca3af" },
    },
  },
  interaction: { intersect: false, mode: "index" },
};

const SimulationRun = () => {
  const navigate = useNavigate();
  const { vfpData } = useVfpDataContext();

  // â”€â”€ Simulation state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [simulationName, setSimulationName] = useState("");
  // "connecting" | "running" | "complete" | "error"
  const [status, setStatus]                 = useState("connecting");
  const [isDownloading, setIsDownloading]   = useState(false);
  const [isExporting, setIsExporting]       = useState(false);

  // â”€â”€ Messages â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Only non-residual messages live in React state (infrequent â†’ no perf issue).
  // Residual lines go straight to residualBufferRef and are never stored here.
  const [messages, setMessages]           = useState([]);
  const [showSolverLines, setShowSolverLines] = useState(false);
  const messageBufferRef = useRef([]);   // [{ text, type }] â€” flushed every 150 ms

  // â”€â”€ Residuals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [residualRuns, setResidualRuns] = useState([
    { id: 0, iterations: [], residuals: [], color: RUN_COLORS[0] },
  ]);
  const residualBufferRef  = useRef([]); // [{ runIdx, iteration, residual }]
  const currentRunIndexRef = useRef(0);

  // â”€â”€ Live stats (ref â†’ no re-render on every solver line; synced at 4 fps) â”€
  const liveStatsRef                = useRef({ iteration: null, residual: null });
  const [liveStats, setLiveStats]   = useState({ iteration: null, residual: null });
  const [elapsedTime, setElapsedTime] = useState(0);
  const startTimeRef = useRef(null);

  // â”€â”€ Socket / misc refs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const socketRef          = useRef(null);
  const [socket, setSocket] = useState(null);
  const startEmittedRef    = useRef(false);
  const downloadIntentRef  = useRef("download");
  const messageBoxRef      = useRef(null);
  // Stable refs so the socket useEffect can read the latest values without
  // being listed as deps - avoids re-creating the socket when vfpData gets a
  // new object reference (happens with large continuationDumpData payloads).
  const vfpDataRef  = useRef(vfpData);
  const navigateRef = useRef(navigate);
  vfpDataRef.current  = vfpData;
  navigateRef.current = navigate;

  // â”€â”€ Buffer flush: 150 ms interval â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Collecting all incoming data in refs and flushing at ~7 fps instead of
  // calling setState once per solver line (which can be 100+ lines/sec)
  // prevents React from thrashing and Chart.js from queueing animations.
  useEffect(() => {
    const id = setInterval(() => {
      const msgs = messageBufferRef.current.splice(0);
      if (msgs.length > 0) {
        setMessages((prev) => {
          const combined = [...prev, ...msgs];
          // Cap at 2000 entries to prevent DOM bloat in long runs
          return combined.length > 2000 ? combined.slice(-2000) : combined;
        });
      }

      const residuals = residualBufferRef.current.splice(0);
      if (residuals.length > 0) {
        setResidualRuns((prev) => {
          const next = prev.map((r) => ({
            ...r,
            iterations: [...r.iterations],
            residuals:  [...r.residuals],
          }));
          for (const { runIdx, iteration, residual } of residuals) {
            if (next[runIdx]) {
              next[runIdx].iterations.push(iteration);
              next[runIdx].residuals.push(residual);
            }
          }
          return next;
        });
        const last = residuals[residuals.length - 1];
        liveStatsRef.current = { iteration: last.iteration, residual: last.residual };
      }
    }, 150);
    return () => clearInterval(id);
  }, []);

  // â”€â”€ Live stats display: 4 fps â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    const id = setInterval(() => {
      setLiveStats({ ...liveStatsRef.current });
      if (startTimeRef.current) setElapsedTime(Date.now() - startTimeRef.current);
    }, 250);
    return () => clearInterval(id);
  }, []);

  // â”€â”€ Auto-scroll console â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (messageBoxRef.current) {
      messageBoxRef.current.scrollTop = messageBoxRef.current.scrollHeight;
    }
  }, [messages]);

  // â”€â”€ Socket setup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    // Capture the stable ref values for this effect invocation.
    // Using refs (not the reactive vfpData / navigate values) ensures this
    // effect only runs once on mount — not every time vfpData gets a new
    // object reference (which happens when continuationDumpData is present).
    const currentVfpData = vfpDataRef.current;
    const nav            = navigateRef.current;

    if (!currentVfpData?.formData) {
      console.error("SimulationRun: no vfpData in context");
      return;
    }

    // Guard against React StrictMode double-invocation: if this cleanup fires
    // before the socket connects, the disconnect() in the cleanup callback
    // prevents any half-open session from racing against the real socket.
    let cancelled = false;

    const newSocket = createSocket({ timeout: 20000 });
    socketRef.current = newSocket;

    newSocket.on("connect", () => {
      if (cancelled) { newSocket.disconnect(); return; }
      if (startEmittedRef.current) return;
      const simName = currentVfpData.formData.simName;
      setSimulationName(simName);
      setStatus("running");
      startTimeRef.current = Date.now();
      newSocket.emit("start_simulation", { simName, vfpData: currentVfpData });
      startEmittedRef.current = true;
    });

    newSocket.on("message", (data) => {
      const type = classifyMessage(data);

      if (type === "residual") {
        // Never put residual lines in React state â€” parse directly into the buffer.
        const parsed = parseResidualLine(data);
        if (parsed) {
          const absRes = Math.abs(parsed.residual);
          if (absRes > 0) {
            residualBufferRef.current.push({
              runIdx:   currentRunIndexRef.current,
              iteration: parsed.iteration,
              residual:  absRes,
            });
            // Update live stats ref (cheap â€” no setState)
            liveStatsRef.current = { iteration: parsed.iteration, residual: absRes };
          }
        }
        // Still buffer the text so it can be shown when "show all" is toggled
        messageBufferRef.current.push({ text: data, type });
        return;
      }

      // Non-residual line â†’ buffer for display
      messageBufferRef.current.push({ text: data, type });

      // [ALL DONE] signals a new continuation run â€” must update synchronously
      // so subsequent residual points are attributed to the correct run index.
      if (/\[all done\]/i.test(data)) {
        setResidualRuns((prev) => {
          const nextIdx = prev.length;
          currentRunIndexRef.current = nextIdx;
          return [
            ...prev,
            {
              id: Date.now(),
              iterations: [],
              residuals:  [],
              color: RUN_COLORS[nextIdx % RUN_COLORS.length],
            },
          ];
        });
      }

      if (/solver complete|simulation complete|finished/i.test(data.toLowerCase())) {
        setStatus("complete");
      }
    });

    newSocket.on("connect_error", (err) => {
      console.error("[SimulationRun] Connection error:", err?.message || err);
      messageBufferRef.current.push({
        text: `Connection error: ${err?.message || "could not reach server"}`,
        type: "error",
      });
      setStatus("error");
    });

    newSocket.on("simulation_finished", () => setStatus("complete"));

    newSocket.on("download_ready", ({ fileData, simName: sName, fileName }) => {
      const intent       = downloadIntentRef.current || "download";
      const resolvedName = fileName || `${sName || "simulation"}.vfp`;
      setIsDownloading(false);
      setIsExporting(false);
      downloadIntentRef.current = "download";

      if (!fileData) { alert("Unable to retrieve simulation file from server."); return; }

      if (intent === "vfppost") {
        try {
          const blob = new Blob([fileData], { type: "application/json" });
          const file = new File([blob], resolvedName, { type: "application/json" });
          nav("/post", {
            state: { vfpFile: file, fileName: resolvedName, transferId: Date.now() },
          });
        } catch {
          alert("Failed to pass simulation file to VFP Post. Please try again.");
        }
        return;
      }

      const blob = new Blob([fileData], { type: "application/json" });
      const url  = URL.createObjectURL(blob);
      const a    = Object.assign(document.createElement("a"), { href: url, download: resolvedName });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });

    newSocket.on("simulation_folder_ready", (folderData) => {
      setIsExporting(false);
      if (folderData?.success) {
        nav("/post", {
          state: { simulationFolder: folderData.data, simName: folderData.simName },
        });
      } else {
        alert("Failed to export simulation data. Please try again.");
      }
    });

    newSocket.on("error", (errorData) => {
      setIsDownloading(false);
      setIsExporting(false);
      if (typeof errorData === "string" && errorData) {
        messageBufferRef.current.push({ text: `ERROR: ${errorData}`, type: "error" });
        setStatus("error");
      } else if (errorData?.type === "simulation_folder_error") {
        alert("Error exporting simulation data: " + (errorData.message || "Unknown error"));
      }
    });

    newSocket.on("disconnect", (reason) => {
      // Log the reason so silent disconnects are visible in the browser console
      if (reason !== "io client disconnect") {
        console.warn("[SimulationRun] Socket disconnected:", reason);
        messageBufferRef.current.push({
          text: `Connection lost: ${reason}`,
          type: "error",
        });
      }
      // Only mark as error if we never completed
      setStatus((prev) => (prev === "complete" ? "complete" : "error"));
    });

    setSocket(newSocket);
    return () => {
      cancelled = true;
      newSocket.disconnect();
      startEmittedRef.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — uses vfpDataRef/navigateRef

  // â”€â”€ Action handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleDownload = useCallback(() => {
    if (!simulationName) { alert("Simulation name not available."); return; }
    const s = socketRef.current;
    if (s) { setIsDownloading(true); downloadIntentRef.current = "download"; s.emit("download", { simName: simulationName }); }
  }, [simulationName]);

  const handleExportToVFPPost = useCallback(() => {
    if (!simulationName) { alert("Simulation name not available."); return; }
    const s = socketRef.current;
    if (s) { setIsExporting(true); downloadIntentRef.current = "vfppost"; s.emit("download", { simName: simulationName }); }
    else    { alert("Connection error. Please try again."); }
  }, [simulationName]);

  const handleStop = useCallback(() => {
    socketRef.current?.emit("stop_simulation");
  }, []);

  const handleClose = useCallback(() => {
    socketRef.current?.disconnect();
    navigate(-1);
  }, [navigate]);

  // â”€â”€ Derived / display data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const displayMessages = showSolverLines
    ? messages.slice(-400)
    : messages.filter((m) => m.type !== "residual").slice(-400);

  const totalResidualPoints = residualRuns.reduce((s, r) => s + r.iterations.length, 0);
  const hasResiduals = totalResidualPoints > 0;

  const chartData = {
    datasets: residualRuns
      .filter((run) => run.iterations.length > 0)
      .map((run, idx) => ({
        label: idx === 0 ? "Residuals" : `Residuals (run ${idx + 1})`,
        // Filter out zero values â€” log scale cannot render log(0)
        data: run.iterations
          .map((it, i) => ({ x: it, y: run.residuals[i] }))
          .filter((p) => p.y > 0),
        borderColor:     run.color,
        backgroundColor: run.color,
        tension:         0.15,
        pointRadius:     0,        // hidden during streaming for performance
        pointHoverRadius: 5,
        borderWidth:     1.5,
        showLine:        true,
        spanGaps:        false,
        fill:            false,
      })),
  };

  // â”€â”€ Status config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const STATUS = {
    connecting: { dot: "bg-yellow-400 animate-pulse", label: "Connecting", badge: "bg-yellow-50 text-yellow-700 border-yellow-300" },
    running:    { dot: "bg-blue-500 animate-pulse",   label: "Running",    badge: "bg-blue-50 text-blue-700 border-blue-300" },
    complete:   { dot: "bg-emerald-500",              label: "Complete", badge: "bg-emerald-50 text-emerald-700 border-emerald-300" },
    error:      { dot: "bg-red-500",                  label: "Error",      badge: "bg-red-50 text-red-700 border-red-300" },
  };
  const sc = STATUS[status] ?? STATUS.connecting;

  // â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return (
    <div className="flex flex-col h-screen bg-gray-50 font-sans text-gray-900 overflow-hidden">

      {/* â”€â”€ Top header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <header className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-2.5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">

          {/* Left: sim name + status */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${sc.dot}`} />
              <span className="text-sm font-semibold text-gray-800">VFP Simulation</span>
            </div>
            {simulationName && (
              <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-mono border border-gray-300">
                {simulationName}
              </span>
            )}
            <span className={`px-2 py-0.5 rounded text-xs font-medium border ${sc.badge}`}>
              {sc.label}
            </span>
          </div>

          {/* Centre: live stats */}
          {(status === "running" || status === "complete") && (
            <div className="flex items-center gap-4 text-xs font-mono text-gray-500 flex-wrap">
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                {fmtElapsed(elapsedTime)}
              </span>
              {liveStats.iteration != null && (
                <span>
                  iter <span className="text-blue-600 font-semibold">
                    {liveStats.iteration.toLocaleString()}
                  </span>
                </span>
              )}
              {liveStats.residual != null && (
                <span>
                  {"| res |"} <span className={`font-semibold ${
                    liveStats.residual < 1e-5  ? "text-emerald-600" :
                    liveStats.residual < 1e-3  ? "text-amber-600"   : "text-red-600"
                  }`}>
                    {fmtResidual(liveStats.residual)}
                  </span>
                </span>
              )}
              {hasResiduals && (
                <span className="text-gray-400">
                  {totalResidualPoints.toLocaleString()} pts
                </span>
              )}
            </div>
          )}

          {/* Right: action buttons */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {status === "running" && (
              <button onClick={handleStop}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-medium transition-colors shadow-sm">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="1.5"/>
                </svg>
                Stop
              </button>
            )}

            <button onClick={handleDownload}
              disabled={isDownloading || status === "connecting"}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded text-xs font-medium transition-colors disabled:cursor-not-allowed shadow-sm">
              {isDownloading
                ? <><span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin inline-block"/> Downloading</>
                : <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v8m0 0l-3-3m3 3l3-3"/>
                  </svg> Download</>}
            </button>

            <button onClick={handleExportToVFPPost}
              disabled={isExporting || status === "connecting"}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded text-xs font-medium transition-colors disabled:cursor-not-allowed shadow-sm">
              {isExporting
                ? <><span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin inline-block"/> Exporting…</>
                : <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.9A5 5 0 1115.9 6h.1a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"/>
                  </svg> VFP Post</>}
            </button>

            <button onClick={handleClose}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-gray-100 text-gray-700 rounded text-xs font-medium transition-colors border border-gray-300 shadow-sm">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
              </svg>
              Close
            </button>
          </div>
        </div>
      </header>

      {/* â”€â”€ Main: console (5) + chart (8) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <main className="flex-1 overflow-hidden grid grid-cols-[minmax(0,5fr)_minmax(0,8fr)]">

        {/* â”€â”€ Console â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <section className="flex flex-col border-r border-gray-200 overflow-hidden">

          {/* Console toolbar */}
          <div className="flex-shrink-0 flex items-center justify-between px-3 py-1.5 bg-gray-100 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
              </svg>
              <span className="text-xs font-semibold text-gray-600">Console</span>
              <span className="px-1.5 py-0.5 bg-white text-gray-500 rounded text-xs font-mono border border-gray-300">
                {messages.filter((m) => m.type !== "residual").length}
              </span>
            </div>

            {/* Filter toggle */}
            <button
              onClick={() => setShowSolverLines((v) => !v)}
              title={showSolverLines ? "Hide solver/residual lines" : "Show all output lines"}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors border ${
                showSolverLines
                  ? "bg-blue-50 text-blue-700 border-blue-300"
                  : "bg-white text-gray-500 border-gray-300 hover:text-gray-700"
              }`}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d={showSolverLines
                    ? "M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                    : "M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"}
                />
              </svg>
              {showSolverLines ? "All" : "Filtered"}
            </button>
          </div>

          {/* Messages */}
          <div
            ref={messageBoxRef}
            className="flex-1 overflow-y-auto p-2 bg-white min-h-0 space-y-px"
            style={{ scrollbarWidth: "thin", scrollbarColor: "#d1d5db #f9fafb" }}
          >
            {displayMessages.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <div className="text-center text-gray-400">
                  <svg className="w-7 h-7 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
                  </svg>
                  <p className="text-xs">Waiting for output…</p>
                </div>
              </div>
            ) : (
              <>
                {displayMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`px-1.5 py-0.5 text-xs leading-snug rounded-sm ${MSG_CLASS[msg.type] ?? MSG_CLASS.log}`}
                  >
                    {msg.text}
                  </div>
                ))}

                {/* Solver lines hidden notice */}
                {!showSolverLines && totalResidualPoints > 0 && (
                  <div className="px-2 py-1 text-gray-400 text-xs italic border-t border-gray-200 mt-1">
                    {totalResidualPoints.toLocaleString()} solver lines hidden —{" "}
                    <button
                      onClick={() => setShowSolverLines(true)}
                      className="text-blue-600 hover:text-blue-500 underline underline-offset-2"
                    >
                      show all
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        {/* â”€â”€ Chart â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <section className="flex flex-col overflow-hidden bg-white">

          {/* Chart toolbar */}
          <div className="flex-shrink-0 flex items-center justify-between px-3 py-1.5 bg-gray-100 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"/>
              </svg>
              <span className="text-xs font-semibold text-gray-600">Convergence History</span>
              {residualRuns.length > 1 && (
                <span className="px-1.5 py-0.5 bg-white text-gray-500 rounded text-xs border border-gray-300">
                  {residualRuns.length} runs
                </span>
              )}
            </div>

            {/* Live convergence readout */}
            {liveStats.residual != null && (
              <div className="flex items-center gap-2 font-mono text-xs">
                <span className="text-gray-500">|res|</span>
                <span className={`font-semibold tabular-nums ${
                  liveStats.residual < 1e-5 ? "text-emerald-600" :
                  liveStats.residual < 1e-3 ? "text-amber-600"   : "text-red-600"
                }`}>
                  {fmtResidual(liveStats.residual)}
                </span>
                {liveStats.residual < 1e-5 && (
                  <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-300 rounded text-xs">
                    converged
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Chart canvas */}
          <div className="flex-1 p-3 bg-white min-h-0">
            {hasResiduals ? (
              <Line data={chartData} options={CHART_OPTIONS} />
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center text-gray-400">
                  <svg className="w-10 h-10 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"/>
                  </svg>
                  <p className="text-sm font-medium">Waiting for residual data…</p>
                  <p className="text-xs mt-1 opacity-60">Chart updates automatically</p>
                </div>
              </div>
            )}
          </div>
        </section>

      </main>
    </div>
  );
};

export default SimulationRun;


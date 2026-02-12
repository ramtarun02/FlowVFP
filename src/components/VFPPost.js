import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Plot from 'react-plotly.js';
import { fetchAPI } from '../utils/fetch';
import { useSimulationData } from "../components/SimulationDataContext";
import regression from 'regression';

function PostProcessing() {
  // --- Routing and Context ---
  const navigate = useNavigate();
  const location = useLocation();
  const {
    simulationData, setSimulationData,
    selectedFiles, setSelectedFiles,
    polars, setPolars,
    polarsSource, setPolarsSource,
    aeroCoefficients, setAeroCoefficients,
    selectedLevel, setSelectedLevel,
    selectedSection, setSelectedSection,
    selectedPlotType, setSelectedPlotType,
    selectedSpanwiseCoeff, setSelectedSpanwiseCoeff,
    parsedCpData, setParsedCpData,
    parsedDatData, setParsedDatData,
    parsedForcesData, setParsedForcesData,
    selectedTailFile, setSelectedTailFile,
    selectedtailGEOFile, setSelectedtailGEOFile,
    tailPlaneParams, setTailPlaneParams
  } = useSimulationData();

  // --- UI State ---
  const [isExplorerOpen, setIsExplorerOpen] = useState(true);
  const [explorerWidth, setExplorerWidth] = useState(320);
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef(null);

  const [isTextMode, setIsTextMode] = useState(false);
  const [openedTextFiles, setOpenedTextFiles] = useState([]);
  const [activeTextTab, setActiveTextTab] = useState(null);

  // --- Dropdown and Plot States ---
  const [levels, setLevels] = useState([]);
  const [sections, setSections] = useState([]);
  const [plotData1, setPlotData1] = useState(null);
  const [plotData2, setPlotData2] = useState(null);
  const [meshData, setMeshData] = useState(null);
  const [showMesh, setShowMesh] = useState(false);
  const [showSpanwiseDistribution, setShowSpanwiseDistribution] = useState(false);
  const [spanwiseData, setSpanwiseData] = useState(null);

  // --- Loading States ---
  const [isLoadingCP, setIsLoadingCP] = useState(false);
  const [isLoadingForces, setIsLoadingForces] = useState(false);
  const [isLoadingDAT, setIsLoadingDAT] = useState(false);
  const [isLoadingTail, setIsLoadingTail] = useState(false);

  // --- Coefficients Data ---
  const [coefficients, setCoefficients] = useState({
    CL: 0.000000,
    CD: 0.000000,
    CM: -0.00000
  });

  const [epsilon, setEpsilon] = useState(null);

  const [dragBreakdown, setDragBreakdown] = useState({
    cdInduced: 0.000,
    cdViscous: 0.000,
    cdWave: 0.000
  });

  const extractPolars = useCallback((meta) => {
    const rawPolars = meta?.results?.wingConfig?.Polars || meta?.Polars || meta?.polars;
    if (!rawPolars) return null;

    const alphaArr = rawPolars.alpha || rawPolars.ALFAWI || rawPolars.alfa || rawPolars.ALPHA;
    const clArr = rawPolars.CL || rawPolars.cl || rawPolars.CL0;
    const cdArr = rawPolars.CDtotVFP || rawPolars.cd || rawPolars.CD || rawPolars.CD0;

    const valid = Array.isArray(alphaArr) && Array.isArray(clArr) && Array.isArray(cdArr) &&
      alphaArr.length > 0 && clArr.length > 0 && cdArr.length > 0;
    if (!valid) return null;

    return {
      alpha: alphaArr,
      cl: clArr,
      cd: cdArr
    };
  }, []);

  const navigationTransferRef = useRef(null);

  // --- VFP File State ---
  const [vfpFile, setVfpFile] = useState(null);
  const [vfpMeta, setVfpMeta] = useState(null);
  const [selectedWingFlowFile, setSelectedWingFlowFile] = useState('');
  const [selectedTailFlowFile, setSelectedTailFlowFile] = useState('');
  const [wingResultFiles, setWingResultFiles] = useState({});
  const [tailResultFiles, setTailResultFiles] = useState({});

  // --- Derived flow lists (handles new manifest format) ---
  const wingFlowFiles = useMemo(() => {
    const splitNodes = vfpMeta?.manifest?.splitNodes;
    if (!Array.isArray(splitNodes)) return [];
    return splitNodes.map(node => ({
      key: node.key || node.file || '',
      file: node.file || node.key || '',
      path: node.path || '',
      size: node.size
    })).filter(node => node.key);
  }, [vfpMeta]);

  // Placeholder for tail flows if backend adds them in manifest later
  const tailFlowFiles = useMemo(() => {
    const flows = vfpMeta?.tailConfig?.flowFiles;
    if (Array.isArray(flows)) return flows.map(flow => ({ key: flow, file: flow }));
    if (flows && typeof flows === 'object') return Object.keys(flows).map(flow => ({ key: flow, file: flow }));
    return [];
  }, [vfpMeta]);

  const wingFlowMap = useMemo(() => {
    const map = {};
    wingFlowFiles.forEach(node => { map[node.key] = node; });
    return map;
  }, [wingFlowFiles]);

  const tailFlowMap = useMemo(() => {
    const map = {};
    tailFlowFiles.forEach(node => { map[node.key] = node; });
    return map;
  }, [tailFlowFiles]);

  // --- Shared reset + ingest helpers ---
  const resetVfpState = useCallback(() => {
    setSimulationData(null);
    setParsedCpData(null);
    setParsedDatData(null);
    setParsedForcesData(null);
    setSelectedFiles({ dat: null, cp: null, forces: null });
    setSelectedWingFlowFile('');
    setSelectedTailFlowFile('');
    setWingResultFiles({});
    setTailResultFiles({});
    setLevels([]);
    setSections([]);
    setSelectedLevel('');
    setSelectedSection('');
    setPlotData1(null);
    setPlotData2(null);
    setMeshData(null);
    setShowMesh(false);
    setShowSpanwiseDistribution(false);
    setSelectedSpanwiseCoeff('CL');
    setSpanwiseData(null);
    setIsTextMode(false);
    setOpenedTextFiles([]);
    setActiveTextTab(null);
    setIsLoadingCP(false);
    setIsLoadingForces(false);
    setIsLoadingDAT(false);
    setCoefficients({
      CL: 0.000000,
      CD: 0.000000,
      CM: -0.000000
    });
    setDragBreakdown({
      cdInduced: 0.000,
      cdViscous: 0.000,
      cdWave: 0.000
    });
  }, []);

  const ingestVfpFile = useCallback(async (file) => {
    if (!file) return;
    resetVfpState();
    setVfpFile(file);

    const formData = new FormData();
    formData.append('file', file);
    try {
      const response = await fetchAPI('/upload_vfp', {
        method: 'POST',
        body: formData
      });
      if (!response.ok) throw new Error('Failed to upload .vfp file');
      const meta = await response.json();
      console.log('VFP Meta:', meta);

      // Normalize new response shape: hoist main + manifest + ids
      const normalizedMeta = {
        ...meta?.main,
        manifest: meta?.manifest,
        uploadId: meta?.uploadId || meta?.main?.uploadId,
        uploadedFileName: meta?.uploadedFileName || meta?.main?.uploadedFileName,
        results: meta?.main?.results || meta?.results
      };

      setVfpMeta(normalizedMeta);

       const polars = extractPolars(normalizedMeta);
       if (polars) {
        setPolars(polars);
        setPolarsSource('backend');
        setSimulationData(prev => ({
          ...(prev || {}),
          polars,
          polarsSource: 'backend',
          simName: normalizedMeta?.formData?.simName || meta?.simName || prev?.simName || ''
        }));
       } else {
        setPolars(null);
        setPolarsSource('none');
        setSimulationData(prev => ({ ...(prev || {}), polars: null, polarsSource: 'none' }));
       }
    } catch (err) {
      alert('Error uploading .vfp file: ' + err.message);
      setVfpMeta(null);
    }
  }, [extractPolars, resetVfpState, setPolars, setPolarsSource, setSimulationData]);

  // --- Upload VFP File and Fetch Metadata ---
  const handleVfpFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    ingestVfpFile(file);
  };

  // --- Auto-import from SimulationRun navigation ---
  useEffect(() => {
    const navFile = location.state?.vfpFile;
    const transferId = location.state?.transferId;

    if (!navFile || !transferId) return;
    if (navigationTransferRef.current === transferId) return;

    navigationTransferRef.current = transferId;
    if (navFile instanceof File) {
      ingestVfpFile(navFile);
    }

    // Clear the state so a refresh doesn't re-run the import
    navigate(location.pathname, { replace: true, state: {} });
  }, [ingestVfpFile, location.pathname, location.state, navigate]);

  // --- Fetch Result Files for Selected Wing Flow File ---
  useEffect(() => {
    if (!vfpMeta || !selectedWingFlowFile) {
      setWingResultFiles({});
      return;
    }
    const fetchWingResultFiles = async () => {
      const node = wingFlowMap[selectedWingFlowFile];
      if (!node) return;
      try {
        const response = await fetchAPI('/get_vfp_result_files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uploadId: vfpMeta.uploadId,
            vfpFileName: vfpMeta.uploadedFileName,
            configType: 'wingConfig',
            flowFile: node.file || selectedWingFlowFile,
            flowKey: node.key,
            flowPath: node.path
          })
        });
        if (!response.ok) throw new Error('Failed to get wing result files');
        const files = await response.json();
        console.log('Wing result files:', files);
        setWingResultFiles(files);
        setSimulationData(prev => ({
          ...(prev || {}),
          simName: `wing / ${selectedWingFlowFile}`,
          files,
          polars: prev?.polars || null,
          polarsSource: prev?.polarsSource
        }));
      } catch (err) {
        alert('Error fetching wing result files: ' + err.message);
        setWingResultFiles({});
      }
    };
    fetchWingResultFiles();
  }, [vfpMeta, selectedWingFlowFile, wingFlowMap]);

  // --- Fetch Result Files for Selected Tail Flow File ---
  useEffect(() => {
    if (!vfpMeta || !selectedTailFlowFile) {
      setTailResultFiles({});
      return;
    }
    const fetchTailResultFiles = async () => {
      const node = tailFlowMap[selectedTailFlowFile];
      if (!node) return;
      try {
        const response = await fetchAPI('/get_vfp_result_files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uploadId: vfpMeta.uploadId,
            vfpFileName: vfpMeta.uploadedFileName,
            configType: 'tailConfig',
            flowFile: node.file || selectedTailFlowFile,
            flowKey: node.key,
            flowPath: node.path
          })
        });
        if (!response.ok) throw new Error('Failed to get tail result files');
        const files = await response.json();
        setTailResultFiles(files);
        setSimulationData(prev => ({
          ...(prev || {}),
          simName: `tail / ${selectedTailFlowFile}`,
          files,
          polars: prev?.polars || null,
          polarsSource: prev?.polarsSource
        }));
      } catch (err) {
        alert('Error fetching tail result files: ' + err.message);
        setTailResultFiles({});
      }
    };
    fetchTailResultFiles();
  }, [vfpMeta, selectedTailFlowFile, tailFlowMap]);

  // --- Request Parsed Data for Selected Flow File ---
  const requestParsedData = async (configType, flowFile, ext) => {
    if (!vfpMeta || !flowFile) return;
    if (!['dat', 'cp', 'forces'].includes(ext)) return;

    const flowNode = configType === 'wingConfig' ? wingFlowMap[flowFile] : tailFlowMap[flowFile];
    const flowFileName = flowNode?.file || flowFile;

    if (ext === 'cp') {
      setIsLoadingCP(true);
      setParsedCpData(null);
      setSections([]);
      setSelectedLevel('');
      setSelectedSection('');
    }
    if (ext === 'forces') {
      setIsLoadingForces(true);
      setParsedForcesData(null);
    }
    if (ext === 'dat') {
      setIsLoadingDAT(true);
      setParsedDatData(null);
    }

    try {
      const response = await fetchAPI('/parse_vfp_file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadId: vfpMeta.uploadId,
          vfpFileName: vfpMeta.uploadedFileName,
          configType,
          flowFile: flowFileName,
          flowKey: flowNode?.key,
          flowPath: flowNode?.path,
          fileType: ext
        })
      });
      if (!response.ok) throw new Error('Failed to parse file');
      const parsedData = await response.json();

      if (ext === 'cp') {
        setParsedCpData(parsedData);
        console.log('Parsed CP Data:', parsedData);
        setIsLoadingCP(false);
        setSelectedFiles(prev => ({ ...prev, cp: { name: `${flowFile}-cp`, configType, flowFile } }));
      }

      if (ext === 'dat') {
        setParsedDatData(parsedData);
        setIsLoadingDAT(false);
        setSelectedFiles(prev => ({ ...prev, dat: { name: `${flowFile}-dat`, configType, flowFile } }));
      }

      if (ext === 'forces') {
        setParsedForcesData(parsedData);
        console.log('Parsed Forces Data:', parsedData);
        setIsLoadingForces(false);
        setSelectedFiles(prev => ({ ...prev, forces: { name: `${flowFile}-forces`, configType, flowFile } }));

        if (parsedData.levels && Object.keys(parsedData.levels).length > 0) {
          const levelKeys = Object.keys(parsedData.levels);
          const sortedLevelKeys = levelKeys.sort((a, b) => {
            const aNum = parseInt(a.match(/\d+/)?.[0] || 0);
            const bNum = parseInt(b.match(/\d+/)?.[0] || 0);
            return bNum - aNum;
          });
          const highestLevelKey = sortedLevelKeys[sortedLevelKeys.length - 1];
          const highestLevel = parsedData.levels[highestLevelKey];
          if (highestLevel.coefficients) {
            setCoefficients({
              CL: highestLevel.ibeCoefficients?.CL || highestLevel.coefficients.CL || 0.000000,
              CD: highestLevel.coefficients.CD || 0.000000,
              CM: highestLevel.coefficients.CM || 0.000000
            });
            setAeroCoefficients({
              CL: highestLevel.ibeCoefficients?.CL || highestLevel.coefficients.CL || 0.000000,
              CD: highestLevel.coefficients.CD || 0.000000,
              CM: highestLevel.coefficients.CM || 0.000000
            });
            setSimulationData(prev => ({
              ...(prev || {}),
              aeroCoefficients: {
                CL: highestLevel.ibeCoefficients?.CL || highestLevel.coefficients.CL || 0.000000,
                CD: highestLevel.coefficients.CD || 0.000000,
                CM: highestLevel.coefficients.CM || 0.000000
              }
            }));
          }
          setDragBreakdown({
            cdInduced: highestLevel.vortexCoefficients?.CD || 0.000,
            cdViscous: highestLevel.viscousDragData?.totalViscousDrag || 0.000,
            cdWave: dragBreakdown.cdWave
          });
        }
      }
    } catch (err) {
      alert('Error parsing file: ' + err.message);
      setIsLoadingCP(false);
      setIsLoadingForces(false);
      setIsLoadingDAT(false);
    }
  };

  // --- File Selection Utility ---
  const isFileSelected = (file) => {
    return Object.values(selectedFiles).some(selected => selected?.name === file.name);
  };

  // --- Level/Section Dropdowns ---
  useEffect(() => {
    let availableLevels = [];
    if (parsedCpData && parsedCpData.levels) {
      availableLevels = Object.keys(parsedCpData.levels).map(levelKey => {
        const levelMatch = levelKey.match(/level(\d+)/);
        const levelNumber = levelMatch ? parseInt(levelMatch[1]) : 1;
        return {
          value: levelKey,
          label: `Level ${levelNumber}`,
          levelNumber: levelNumber
        };
      });
    } else if (parsedDatData && parsedDatData.levels) {
      availableLevels = Object.keys(parsedDatData.levels).map(levelKey => {
        const levelMatch = levelKey.match(/level(\d+)/);
        const levelNumber = levelMatch ? parseInt(levelMatch[1]) : 1;
        return {
          value: levelKey,
          label: `Level ${levelNumber}`,
          levelNumber: levelNumber
        };
      });
    }
    availableLevels.sort((a, b) => b.levelNumber - a.levelNumber);
    setLevels(availableLevels);

    if (selectedLevel && !availableLevels.find(level => level.value === selectedLevel)) {
      setSelectedLevel('');
      setSelectedSection('');
    }
  }, [parsedCpData, parsedDatData, selectedLevel]);

  useEffect(() => {
    if (parsedCpData && selectedLevel) {
      if (parsedCpData.levels && parsedCpData.levels[selectedLevel]) {
        const level = parsedCpData.levels[selectedLevel];
        if (level.sections && Object.keys(level.sections).length > 0) {
          const sectionOptions = Object.entries(level.sections).map(([sectionKey, sectionData]) => {
            const sectionMatch = sectionKey.match(/section(\d+)/);
            let sectionNumber = sectionMatch ? parseInt(sectionMatch[1]) : 1;
            if (sectionData.sectionHeader) {
              const headerSectionMatch = sectionData.sectionHeader.match(/J=\s*(\d+)/);
              if (headerSectionMatch) {
                sectionNumber = parseInt(headerSectionMatch[1]);
              }
            }
            return {
              value: sectionKey,
              label: `Section ${sectionNumber}`,
              sectionNumber: sectionNumber,
              data: sectionData
            };
          });
          sectionOptions.sort((a, b) => a.sectionNumber - b.sectionNumber);
          setSections(sectionOptions);
          setSelectedSection('');
        } else {
          setSections([]);
          setSelectedSection('');
        }
      } else {
        setSections([]);
        setSelectedSection('');
      }
    } else {
      setSections([]);
      setSelectedSection('');
    }
  }, [parsedCpData, selectedLevel]);

  // --- Plot Generation ---
  const generatePlotData = useCallback(() => {
    if (selectedLevel && selectedPlotType && selectedSection && parsedCpData && !showMesh) {
      generatePlot1Data();
      generatePlot2Data();
    }
  }, [selectedLevel, selectedPlotType, selectedSection, parsedCpData, showMesh]);

  useEffect(() => {
    generatePlotData();
  }, [generatePlotData]);

  // --- Polyarea Utility ---
  const polyarea = (x, y) => {
    let area = 0;
    const n = x.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += x[i] * y[j] - x[j] * y[i];
    }
    return Math.abs(area) / 2;
  };

  // --- Spanwise Plot Data ---
  const generateSpanwisePlotData = useCallback(() => {
    if (selectedLevel && selectedSpanwiseCoeff && parsedCpData && showSpanwiseDistribution) {
      if (!parsedCpData.levels || !parsedCpData.levels[selectedLevel]) return;
      const level = parsedCpData.levels[selectedLevel];
      const sections = level.sections;
      if (!sections || Object.keys(sections).length === 0) return;

      const yaveYtipValues = [];
      const coeffValues = [];
      const chordValues = [];
      const loadValues = [];

      Object.values(sections).forEach((section) => {
        if (section.sectionHeader) {
          const match = section.sectionHeader.match(/YAVE\/YTIP=\s*([0-9.+-eE]+)/);
          if (match) {
            const yaveYtip = parseFloat(match[1]);
            yaveYtipValues.push(yaveYtip);
          } else {
            yaveYtipValues.push(undefined);
          }
          const chord = section.coefficients?.CHORD || section.chord || 1;
          if (selectedSpanwiseCoeff === 'Load') {
            chordValues.push(chord);
          }
        }
      });

      const meanChord = chordValues.length > 0
        ? chordValues.reduce((a, b) => a + b, 0) / chordValues.length
        : 1;

      Object.values(sections).forEach((section, idx) => {
        let coeff;
        if (selectedSpanwiseCoeff === 'Load') {
          const cl = section.coefficients?.CL;
          const chord = section.coefficients?.CHORD || section.chord || 1;
          coeff = (cl !== undefined && chord !== undefined && meanChord !== 0)
            ? cl * chord / meanChord
            : undefined;
          loadValues.push(coeff);
        } else {
          coeff = section.coefficients?.[selectedSpanwiseCoeff];
        }
        if (yaveYtipValues[idx] !== undefined && coeff !== undefined) {
          coeffValues.push(coeff);
        }
      });

      const validIndices = yaveYtipValues
        .map((val, idx) => ({ val, idx }))
        .filter(obj => obj.val !== undefined && coeffValues[obj.idx] !== undefined)
        .sort((a, b) => a.val - b.val)
        .map(obj => obj.idx);

      const sortedYaveYtip = validIndices.map(idx => yaveYtipValues[idx]);
      const sortedCoeff = selectedSpanwiseCoeff === 'Load'
        ? validIndices.map(idx => loadValues[idx])
        : validIndices.map(idx => coeffValues[idx]);

      let plotDataArr = [];
      if (selectedSpanwiseCoeff === 'Load') {
        const clcb = sortedCoeff;
        const lastYaveYtip = sortedYaveYtip[sortedYaveYtip.length - 1];
        const lastClcb = clcb[clcb.length - 1];
        const ab = Math.sqrt((lastClcb ** 2) / (1 - lastYaveYtip ** 2));
        const xb = [];
        const yb = [];
        for (let x = lastYaveYtip; x <= 1; x += 0.001) {
          xb.push(x);
          yb.push(Math.sqrt(ab ** 2 * (1 - (x ** 2) / 1 ** 2)));
        }
        const yave2 = [...sortedYaveYtip, ...xb];
        const y2 = [...clcb, ...yb];
        const combined = yave2.map((y, i) => ({ y, val: y2[i] }));
        combined.sort((a, b) => a.y - b.y);
        const finalYave = combined.map(obj => obj.y);
        const finalY = combined.map(obj => obj.val);

        const a = 1;
        const area = polyarea(finalYave, finalY) + 0.5 * (a * finalY[0] + finalY[finalY.length - 1] * a);
        const b = 4 * area / (Math.PI * a);

        const xIdeal = [];
        const yIdeal = [];
        for (let x = 0; x <= a; x += 0.001) {
          xIdeal.push(x);
          yIdeal.push(Math.sqrt(b ** 2 * (1 - (x ** 2) / (a ** 2))));
        }

        plotDataArr = [
          {
            x: finalYave,
            y: finalY,
            type: 'scatter',
            mode: 'lines',
            line: { color: '#334155', width: 2 },
            name: 'Spanwise Load'
          },
          {
            x: xIdeal,
            y: yIdeal,
            type: 'scatter',
            mode: 'lines',
            line: { color: '#ef4444', dash: 'dash', width: 2 },
            name: 'Ideal Elliptic'
          }
        ];
      } else {
        plotDataArr = [{
          x: sortedYaveYtip,
          y: sortedCoeff,
          type: 'scatter',
          mode: 'markers+lines',
          marker: { color: '#334155', size: 8 },
          line: { color: '#334155', width: 2 },
          name: `${selectedSpanwiseCoeff} vs YAVE/YTIP`
        }];
      }

      const yAxisTitle = selectedSpanwiseCoeff === 'Load' ? 'Load' : selectedSpanwiseCoeff;
      const spanwisePlotLayout = {
        title: { text: `Spanwise Distribution - ${yAxisTitle} vs YAVE/YTIP` },
        xaxis: { title: { text: 'YAVE/YTIP' }, showgrid: true, zeroline: true, showticklabels: true },
        yaxis: { title: { text: `Spanwise ${yAxisTitle}` }, showgrid: true, zeroline: true, showticklabels: true },
        margin: { l: 60, r: 40, t: 60, b: 60 },
        showlegend: selectedSpanwiseCoeff === 'Load',
        plot_bgcolor: 'white',
        paper_bgcolor: 'white'
      };

      setSpanwiseData({
        data: plotDataArr,
        layout: spanwisePlotLayout,
        config: {
          displayModeBar: true,
          displaylogo: false,
          modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d']
        }
      });
    }
  }, [selectedLevel, selectedSpanwiseCoeff, parsedCpData, showSpanwiseDistribution]);

  useEffect(() => {
    generateSpanwisePlotData();
  }, [generateSpanwisePlotData]);

  // --- Resize Handlers ---
  const handleMouseDown = useCallback((e) => {
    setIsResizing(true);
    e.preventDefault();
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!isResizing) return;
    const newWidth = e.clientX;
    if (newWidth >= 200 && newWidth <= 600) {
      setExplorerWidth(newWidth);
    }
  }, [isResizing]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  // --- Remove VFP Handler ---
  const handleRemoveVfp = () => {
    setVfpFile(null);
    setVfpMeta(null);
    setSimulationData(null);
    setParsedCpData(null);
    setParsedDatData(null);
    setParsedForcesData(null);
    setSelectedFiles({ dat: null, cp: null, forces: null });
    setSelectedWingFlowFile('');
    setSelectedTailFlowFile('');
    setWingResultFiles({});
    setTailResultFiles({});
    setLevels([]);
    setSections([]);
    setSelectedLevel('');
    setSelectedSection('');
    setPlotData1(null);
    setPlotData2(null);
    setMeshData(null);
    setShowMesh(false);
    setShowSpanwiseDistribution(false);
    setSelectedSpanwiseCoeff('CL');
    setSpanwiseData(null);
    setIsTextMode(false);
    setOpenedTextFiles([]);
    setActiveTextTab(null);
    setIsLoadingCP(false);
    setIsLoadingForces(false);
    setIsLoadingDAT(false);
    setCoefficients({
      CL: 0.000000,
      CD: 0.000000,
      CM: -0.000000
    });
    setDragBreakdown({
      cdInduced: 0.000,
      cdViscous: 0.000,
      cdWave: 0.000
    });
  };

  // --- Mesh Button Handler ---
  const handleMeshClick = () => {
    if (!parsedCpData || !selectedLevel) {
      alert('Please select CP file and choose a level first.');
      return;
    }
    if (showMesh) {
      setShowMesh(false);
      setMeshData(null);
    } else {
      generateMeshData();
      setShowMesh(true);
    }
  };

  // --- Generate Mesh Data ---
  const generateMeshData = useCallback(() => {
    if (!parsedCpData || !selectedLevel) return;
    const level = parsedCpData.levels[selectedLevel];
    const sections = level.sections;
    if (!sections || Object.keys(sections).length === 0) return;

    const sectionsArray = Object.values(sections)
      .filter(section => section.coefficients && section.coefficients.YAVE !== undefined)
      .sort((a, b) => a.coefficients.YAVE - b.coefficients.YAVE);

    const maxSections = 40;
    const maxChordPoints = 80;
    const sectionStep = Math.max(1, Math.floor(sectionsArray.length / maxSections));
    const sampledSections = sectionsArray.filter((_, idx) => idx % sectionStep === 0);

    const minChordPoints = Math.min(
      ...sampledSections.map(s => (s['XPHYS'] ? s['XPHYS'].length : 0))
    );
    const chordStep = Math.max(1, Math.floor(minChordPoints / maxChordPoints));

    const meshLines = [];
    for (let sIdx = 0; sIdx < sampledSections.length; sIdx++) {
      const section = sampledSections[sIdx];
      const xArr = section['XPHYS'] || [];
      const zArr = section['ZPHYS'] || [];
      const yave = section.coefficients.YAVE;
      for (let i = 0; i < xArr.length - 1; i += chordStep) {
        meshLines.push({
          x: [xArr[i], xArr[i + chordStep < xArr.length ? i + chordStep : i + 1]],
          y: [yave, yave],
          z: [zArr[i], zArr[i + chordStep < zArr.length ? i + chordStep : i + 1]],
          mode: 'lines',
          type: 'scatter3d',
          line: { color: '#334155', width: 1 },
          showlegend: false,
          hoverinfo: 'skip'
        });
      }
    }
    for (let cIdx = 0; cIdx < minChordPoints; cIdx += chordStep) {
      const xLine = [];
      const yLine = [];
      const zLine = [];
      for (let sIdx = 0; sIdx < sampledSections.length; sIdx++) {
        const section = sampledSections[sIdx];
        const xArr = section['XPHYS'] || [];
        const zArr = section['ZPHYS'] || [];
        const yave = section.coefficients.YAVE;
        if (xArr.length > cIdx && zArr.length > cIdx) {
          xLine.push(xArr[cIdx]);
          yLine.push(yave);
          zLine.push(zArr[cIdx]);
        }
      }
      if (xLine.length > 1) {
        meshLines.push({
          x: xLine,
          y: yLine,
          z: zLine,
          mode: 'lines',
          type: 'scatter3d',
          line: { color: '#a3a3a3', width: 1 },
          showlegend: false,
          hoverinfo: 'skip'
        });
      }
    }
    setMeshData({
      data: meshLines,
      layout: {
        title: `CFD Mesh Visualization - Level ${selectedLevel}`,
        scene: {
          xaxis: { title: 'X', showgrid: true, zeroline: true },
          yaxis: { title: 'Y (Span)', showgrid: true, zeroline: true },
          zaxis: { title: 'Z', showgrid: true, zeroline: true },
          aspectmode: 'data',
          bgcolor: 'white'
        },
        margin: { l: 0, r: 0, t: 40, b: 0 },
        paper_bgcolor: 'white',
        plot_bgcolor: 'white'
      },
      config: {
        displayModeBar: true,
        displaylogo: false,
        modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d']
      }
    });
  }, [parsedCpData, selectedLevel]);

  // --- Spanwise Distribution Button Handler ---
  const handleSpanwiseDistributionClick = () => {
    if (!parsedCpData || !selectedLevel) {
      alert('Please select CP file and choose a level first.');
      return;
    }
    if (showSpanwiseDistribution) {
      setShowSpanwiseDistribution(false);
      setSpanwiseData(null);
    } else {
      setShowSpanwiseDistribution(true);
      setShowMesh(false);
      setMeshData(null);
    }
  };

  // --- Generate 2D Plot Data (Plot 1: CP/Mach vs X/C) ---
  const generatePlot1Data = () => {
    if (!parsedCpData || !selectedLevel || !selectedSection) {
      setPlotData1(null);
      return;
    }
    if (!parsedCpData.levels || !parsedCpData.levels[selectedLevel]) {
      setPlotData1(null);
      return;
    }
    const level = parsedCpData.levels[selectedLevel];
    if (!level.sections || !level.sections[selectedSection]) {
      setPlotData1(null);
      return;
    }
    const section = level.sections[selectedSection];
    const xValues = section['X/C'] || [];
    const yValues = selectedPlotType === 'Cp'
      ? (section['CP'] || [])
      : (section['M'] || []);
    if (xValues.length === 0 || yValues.length === 0) {
      setPlotData1(null);
      return;
    }
    const minXIndex = xValues.indexOf(Math.min(...xValues));
    const lowerSurfaceX = xValues.slice(0, minXIndex + 1);
    const lowerSurfaceY = yValues.slice(0, minXIndex + 1);
    const upperSurfaceX = xValues.slice(minXIndex);
    const upperSurfaceY = yValues.slice(minXIndex);
    const lowerSurfaceColor = '#22c55e';
    const upperSurfaceColor = '#ef4444';
    const plot1Data = [
      {
        x: lowerSurfaceX,
        y: lowerSurfaceY,
        type: 'scatter',
        mode: 'lines+markers',
        line: { color: lowerSurfaceColor, width: 2 },
        marker: { color: lowerSurfaceColor, size: 4 },
        name: 'Lower Surface'
      },
      {
        x: upperSurfaceX,
        y: upperSurfaceY,
        type: 'scatter',
        mode: 'lines+markers',
        line: { color: upperSurfaceColor, width: 2 },
        marker: { color: upperSurfaceColor, size: 4 },
        name: 'Upper Surface'
      }
    ];

    if (selectedPlotType === 'Mach') {
      plot1Data.push({
        x: [Math.min(...xValues), Math.max(...xValues)],
        y: [1, 1],
        type: 'scatter',
        mode: 'lines',
        line: { color: 'blue', dash: 'dash', width: 2 },
        name: 'Mach 1'
      });
    }

    if (selectedPlotType === 'Cp') {
      let mach = section.coefficients?.M || level.coefficients?.M || 1.0;
      const gamma = 1.4;
      const cps = 2 / (gamma * mach ** 2) * (((2 + 0.4 * mach ** 2) / 2.4) ** (gamma / 0.4) - 1);

      const allSections = Object.values(level.sections)
        .filter(sec => sec.coefficients && sec.coefficients.YAVE !== undefined && Array.isArray(sec['XPHYS']) && Array.isArray(sec['ZPHYS']))
        .sort((a, b) => a.coefficients.YAVE - b.coefficients.YAVE);

      const YAVE_arr = [];
      const CPs_LE_arr = [];
      const CPs_MC_arr = [];
      const CPs_TE_arr = [];

      for (let idx = 0; idx < allSections.length; idx++) {
        const sec = allSections[idx];
        const XPHYS = sec['XPHYS'];
        const YAVE = sec.coefficients.YAVE;

        const LE_X = Math.min(...XPHYS);
        const TE_X = Math.max(...XPHYS);

        YAVE_arr.push(YAVE);

        let LE_S = 0, TE_S = 0, ME_S = 0;
        if (idx < allSections.length - 1) {
          const nextSec = allSections[idx + 1];
          const next_LE_X = Math.min(...nextSec['XPHYS']);
          const next_TE_X = Math.max(...nextSec['XPHYS']);
          const next_YAVE = nextSec.coefficients.YAVE;
          LE_S = Math.atan((next_LE_X - LE_X) / (next_YAVE - YAVE)) * 180 / Math.PI;
          TE_S = Math.atan((next_TE_X - TE_X) / (next_YAVE - YAVE)) * 180 / Math.PI;
        }
        if (idx === allSections.length - 1 && idx > 0) {
          LE_S = CPs_LE_arr[CPs_LE_arr.length - 1]?.LE_S || 0;
          TE_S = CPs_TE_arr[CPs_TE_arr.length - 1]?.TE_S || 0;
        }
        ME_S = (LE_S + TE_S) / 2;

        const F_LE = ((1 + 0.5 * 0.4 * mach ** 2 * Math.cos(LE_S * Math.PI / 180) ** 2) /
          (1 + 0.5 * 0.4 * mach ** 2 * Math.cos(ME_S * Math.PI / 180) ** 2)) ** (gamma / 0.4);
        const F_TE = ((1 + 0.5 * 0.4 * mach ** 2 * Math.cos(TE_S * Math.PI / 180) ** 2) /
          (1 + 0.5 * 0.4 * mach ** 2 * Math.cos(ME_S * Math.PI / 180) ** 2)) ** (gamma / 0.4);

        const CPs_LE = (2 * (F_LE - 1) / (gamma * mach ** 2)) + F_LE * cps * Math.cos(ME_S * Math.PI / 180) ** 2;
        const CPs_TE = (2 * (F_TE - 1) / (gamma * mach ** 2)) + F_TE * cps * Math.cos(ME_S * Math.PI / 180) ** 2;
        const CPs_MC = cps * Math.cos(ME_S * Math.PI / 180) ** 2;

        CPs_LE_arr.push(CPs_LE);
        CPs_MC_arr.push(CPs_MC);
        CPs_TE_arr.push(CPs_TE);
      }

      const fitData = [];
      for (let i = 0; i < YAVE_arr.length; i++) {
        fitData.push([0, CPs_LE_arr[i]]);
        fitData.push([0.5, CPs_MC_arr[i]]);
        fitData.push([1, CPs_TE_arr[i]]);
      }

      const result = regression.polynomial(fitData, { order: 2 });
      const fitLineX = [0, 0.25, 0.5, 0.75, 1];
      const fitLineY = fitLineX.map(x => result.predict(x)[1]);

      plot1Data.push({
        x: fitLineX,
        y: fitLineY,
        type: 'scatter',
        mode: 'lines',
        line: { color: 'blue', dash: 'dash', width: 2 },
        name: 'Cp*'
      });
    }

    const sectionMatch = selectedSection.match(/section(\d+)/);
    let sectionNumber = sectionMatch ? parseInt(sectionMatch[1]) : '';
    if (section.sectionHeader) {
      const headerMatch = section.sectionHeader.match(/J=\s*(\d+)/);
      if (headerMatch) {
        sectionNumber = parseInt(headerMatch[1]);
      }
    }
    const plot1Layout = {
      title: `${selectedPlotType} vs X/C - Section ${sectionNumber}`,
      xaxis: {
        title: { text: 'X/C', font: { size: 14, family: 'Arial, sans-serif' } },
        showgrid: true,
        zeroline: true,
        showticklabels: true
      },
      yaxis: {
        title: {
          text: selectedPlotType === 'Cp' ? 'Coefficient of Pressure (CP)' : 'Mach Number',
          font: { size: 14, family: 'Arial, sans-serif' }
        },
        showgrid: true,
        zeroline: true,
        showticklabels: true,
        autorange: selectedPlotType === 'Cp' ? 'reversed' : true
      },
      margin: { l: 60, r: 40, t: 60, b: 60 },
      showlegend: true,
      legend: {
        bgcolor: 'rgba(255,255,255,0.8)',
        bordercolor: 'rgba(0,0,0,0.2)',
        borderwidth: 1,
        dragmode: 'move'
      },
      plot_bgcolor: 'white',
      paper_bgcolor: 'white'
    };
    setPlotData1({
      data: plot1Data,
      layout: plot1Layout,
      config: {
        displayModeBar: true,
        displaylogo: false,
        modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d']
      }
    });
  };

  // --- Generate Plot 2 (Airfoil shape: Z/C vs X/C) ---
  const generatePlot2Data = () => {
    if (!parsedCpData || !selectedLevel || !selectedSection) {
      setPlotData2(null);
      return;
    }
    if (!parsedCpData.levels || !parsedCpData.levels[selectedLevel]) {
      setPlotData2(null);
      return;
    }
    const level = parsedCpData.levels[selectedLevel];
    if (!level.sections || !level.sections[selectedSection]) {
      setPlotData2(null);
      return;
    }
    const section = level.sections[selectedSection];
    const xValues = section['X/C'] || [];
    const zValues = section['Z/C'] || [];
    if (xValues.length === 0 || zValues.length === 0) {
      setPlotData2(null);
      return;
    }
    const plot2Data = [{
      x: xValues,
      y: zValues,
      type: 'scatter',
      mode: 'lines+markers',
      line: { color: '#334155', width: 2 },
      marker: { color: '#334155', size: 4 },
      name: 'Airfoil Shape'
    }];
    const sectionMatch = selectedSection.match(/section(\d+)/);
    let sectionNumber = sectionMatch ? parseInt(sectionMatch[1]) : '';
    if (section.sectionHeader) {
      const headerMatch = section.sectionHeader.match(/J=\s*(\d+)/);
      if (headerMatch) {
        sectionNumber = parseInt(headerMatch[1]);
      }
    }
    const plot2Layout = {
      title: `Airfoil Shape - Section ${sectionNumber}`,
      xaxis: { title: 'X/C', showgrid: true, zeroline: true, showticklabels: true },
      yaxis: {
        title: 'Z/C',
        showgrid: true,
        zeroline: true,
        showticklabels: true,
        scaleanchor: 'x',
        scaleratio: 1
      },
      margin: { l: 60, r: 40, t: 60, b: 60 },
      showlegend: false,
      plot_bgcolor: 'white',
      paper_bgcolor: 'white'
    };
    setPlotData2({
      data: plot2Data,
      layout: plot2Layout,
      config: {
        displayModeBar: true,
        displaylogo: false,
        modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d']
      }
    });
  };

  const handleContourPlotClick = () => {
    if (!parsedCpData || !selectedLevel) {
      alert('Please select CP file and choose a level first.');
      return;
    }
    // No need to pass simulationFolder in state, context will be used
    navigate('/post-processing/contour-plot');
  };

  const handleNavigateToProWim = () => {
    const polarsPayload = polars || simulationData?.polars || extractPolars(vfpMeta) || null;
    if (!polarsPayload) {
      setPolars(null);
      setPolarsSource('missing');
      setSimulationData(prev => ({ ...(prev || {}), polars: null, polarsSource: 'missing' }));
    }
    navigate('/post-processing/prowim', { state: { polars: polarsPayload } });
  };


  // --- File Explorer Render ---
  const renderFileExplorer = () => {
    if (!vfpFile) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-6 text-center">
          <div className="text-gray-400 mb-4">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-gray-600 mb-4">No .vfp file loaded</p>
          <label className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 cursor-pointer">
            Import .vfp File
            <input type="file" accept=".vfp,application/json" className="hidden" onChange={handleVfpFileUpload} />
          </label>


        </div>
      );
    }
    if (!vfpMeta) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-6 text-center">
          <p className="text-gray-600 mb-4">Loading .vfp metadata...</p>
        </div>
      );
    }
    return (
      <div className="h-full flex flex-col">
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <h3 className="text-lg font-semibold text-gray-800 mb-3">{vfpFile.name}</h3>
          <div className="mb-3 flex items-center justify-between">

          </div>
          <div className="space-y-1">
            <div className={`text-xs px-2 py-1 rounded-md font-medium ${selectedFiles.dat ? 'bg-slate-100 text-slate-800' : 'bg-gray-100 text-gray-600'}`}>
              DAT: {isLoadingDAT ? '⏳ Loading...' : selectedFiles.dat ? '✓ Loaded' : '○ Not loaded'}
            </div>
            <div className={`text-xs px-2 py-1 rounded-md font-medium ${selectedFiles.cp ? 'bg-slate-100 text-slate-800' : 'bg-gray-100 text-gray-600'}`}>
              CP: {isLoadingCP ? '⏳ Loading...' : selectedFiles.cp ? '✓ Loaded' : '○ Not loaded'}
            </div>
            <div className={`text-xs px-2 py-1 rounded-md font-medium ${selectedFiles.forces ? 'bg-slate-100 text-slate-800' : 'bg-gray-100 text-gray-600'}`}>
              FORCES: {isLoadingForces ? '⏳ Loading...' : selectedFiles.forces ? '✓ Loaded' : '○ Not loaded'}
            </div>
          </div>
        </div>
        {/* Flow File Dropdowns */}
        <div className="p-4 border-b border-gray-200 bg-gray-50 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Wing Flow File</label>
            <select
              className="w-full px-3 py-2 border border-blue-300 rounded-lg"
              value={selectedWingFlowFile}
              onChange={e => {
                setSelectedWingFlowFile(e.target.value);
                setSelectedTailFlowFile('');
                setWingResultFiles({});
                setTailResultFiles({});
                setParsedCpData(null);
                setParsedDatData(null);
                setParsedForcesData(null);
                setSelectedFiles({ dat: null, cp: null, forces: null });
                setLevels([]);
                setSections([]);
                setSelectedLevel('');
                setSelectedSection('');
                setPlotData1(null);
                setPlotData2(null);
                setMeshData(null);
                setShowMesh(false);
                setShowSpanwiseDistribution(false);
                setSelectedSpanwiseCoeff('CL');
                setSpanwiseData(null);
              }}
            >
              <option value="">Select Wing Flow File</option>
              {wingFlowFiles.map(flow => (
                <option key={flow.key} value={flow.key}>{flow.key}</option>
              ))}
            </select>
          </div>
          {tailFlowFiles.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tail Flow File</label>
              <select
                className="w-full px-3 py-2 border border-blue-300 rounded-lg"
                value={selectedTailFlowFile}
                onChange={e => {
                  setSelectedTailFlowFile(e.target.value);
                  setParsedCpData(null);
                  setParsedDatData(null);
                  setParsedForcesData(null);
                  setSelectedFiles({ dat: null, cp: null, forces: null });
                  setLevels([]);
                  setSections([]);
                  setSelectedLevel('');
                  setSelectedSection('');
                  setPlotData1(null);
                  setPlotData2(null);
                  setMeshData(null);
                  setShowMesh(false);
                  setShowSpanwiseDistribution(false);
                  setSelectedSpanwiseCoeff('CL');
                  setSpanwiseData(null);
                }}
              >
                <option value="">Select Tail Flow File</option>
                {tailFlowFiles.map(flow => (
                  <option key={flow.key} value={flow.key}>{flow.key}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        {/* Result Files */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {selectedWingFlowFile && (
            <div>
              <h4 className="font-semibold text-blue-700 mb-2">Wing Result Files</h4>
              {Object.entries(wingResultFiles).map(([fileType, fileList]) => {
                if (!Array.isArray(fileList) || fileList.length === 0) return null;
                return (
                  <div key={fileType} className="mb-2">
                    <div className="flex items-center mb-1">
                      <span className="text-lg mr-2">{getFileTypeIcon(fileType)}</span>
                      <span className="font-medium text-gray-800">{fileType.toUpperCase()} Files ({fileList.length})</span>
                    </div>
                    <div className="space-y-1">
                      {fileList.map((file, index) => {
                        const isLoading = (fileType === 'cp' && isLoadingCP) ||
                          (fileType === 'forces' && isLoadingForces) ||
                          (fileType === 'dat' && isLoadingDAT);
                        const isSelected = isFileSelected(file) && !isLoading;
                        return (
                          <div
                            key={`${file.name}-${index}`}
                            className={`flex items-center p-2 rounded-lg transition-all duration-200 ${isSelected
                              ? 'bg-slate-100 border border-slate-300 shadow-sm'
                              : 'hover:bg-gray-50 border border-transparent'
                              } ${isLoading ? 'opacity-60 cursor-wait' : 'cursor-pointer'}`}
                            onClick={() => {
                              if (!isLoading && ['dat', 'cp', 'forces'].includes(fileType)) {
                                requestParsedData('wingConfig', selectedWingFlowFile, fileType);
                              }
                            }}
                            title={file.name}
                          >
                            <span className="text-sm mr-2">{isLoading ? '⏳' : getFileIcon(file.name)}</span>
                            <span className="flex-1 text-sm truncate">{file.name}</span>
                            {isSelected && <span className="text-slate-600 text-sm font-medium">✓</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {selectedTailFlowFile && (
            <div>
              <h4 className="font-semibold text-blue-700 mb-2">Tail Result Files</h4>
              {Object.entries(tailResultFiles).map(([fileType, fileList]) => {
                if (!Array.isArray(fileList) || fileList.length === 0) return null;
                return (
                  <div key={fileType} className="mb-2">
                    <div className="flex items-center mb-1">
                      <span className="text-lg mr-2">{getFileTypeIcon(fileType)}</span>
                      <span className="font-medium text-gray-800">{fileType.toUpperCase()} Files ({fileList.length})</span>
                    </div>
                    <div className="space-y-1">
                      {fileList.map((file, index) => {
                        const isLoading = (fileType === 'cp' && isLoadingCP) ||
                          (fileType === 'forces' && isLoadingForces) ||
                          (fileType === 'dat' && isLoadingDAT);
                        const isSelected = isFileSelected(file) && !isLoading;
                        return (
                          <div
                            key={`${file.name}-${index}`}
                            className={`flex items-center p-2 rounded-lg transition-all duration-200 ${isSelected
                              ? 'bg-slate-100 border border-slate-300 shadow-sm'
                              : 'hover:bg-gray-50 border border-transparent'
                              } ${isLoading ? 'opacity-60 cursor-wait' : 'cursor-pointer'}`}
                            onClick={() => {
                              if (!isLoading && ['dat', 'cp', 'forces'].includes(fileType)) {
                                requestParsedData('tailConfig', selectedTailFlowFile, fileType);
                              }
                            }}
                            title={file.name}
                          >
                            <span className="text-sm mr-2">{isLoading ? '⏳' : getFileIcon(file.name)}</span>
                            <span className="flex-1 text-sm truncate">{file.name}</span>
                            {isSelected && <span className="text-slate-600 text-sm font-medium">✓</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  // --- File Type Icons ---
  const getFileTypeIcon = (fileType) => {
    const icons = {
      dat: '📊',
      cp: '📈',
      forces: '⚡',
      geo: '🔧',
      map: '🗺️',
      txt: '📝',
      log: '📋',
      other: '📄'
    };
    return icons[fileType] || '📄';
  };

  const getFileIcon = (filename) => {
    const ext = filename.split('.').pop().toLowerCase();
    switch (ext) {
      case 'dat': return '📊';
      case 'cp': return '📈';
      case 'forces': return '⚡';
      case 'map': return '🗺️';
      case 'geo': return '🔧';
      case 'txt': return '📝';
      case 'log': return '📋';
      default: return '📄';
    }
  };

  // --- Aspect Ratio/Epsilon ---
  function computeAspectRatio(parsedCpData, selectedLevel) {
    if (!parsedCpData || !parsedCpData.levels || !selectedLevel) return null;
    const level = parsedCpData.levels[selectedLevel];
    if (!level.sections) return null;
    const sections = Object.values(level.sections);
    if (sections.length < 2) return null;

    const yaves = [];
    const chords = [];
    sections.forEach(section => {
      let yave = section.coefficients?.YAVE;
      let chord = section.coefficients?.CHORD;
      if (yave !== undefined && chord !== undefined) {
        yaves.push(yave);
        chords.push(chord);
      }
    });

    if (yaves.length < 2 || chords.length < 2) return null;

    const combined = yaves.map((y, i) => ({ y, c: chords[i] }));
    combined.sort((a, b) => a.y - b.y);
    const y = combined.map(obj => obj.y);
    const c = combined.map(obj => obj.c);

    let wingArea = 0;
    const n = y.length;

    if (n % 2 === 1 || n < 15) {
      for (let i = 1; i < n; i++) {
        wingArea += (y[i] - y[i - 1]) * (c[i] + c[i - 1]) / 2;
      }
    } else {
      const h = (y[n - 1] - y[0]) / (n - 1);
      let sum = c[0] + c[n - 1];
      for (let i = 1; i < n - 1; i++) {
        sum += (i % 2 === 0 ? 2 : 4) * c[i];
      }
      wingArea = (h / 3) * sum;
    }
    wingArea *= 2;

    const span = 2 * Math.abs(y[y.length - 1]);
    if (wingArea === 0) return null;
    return (span * span / wingArea);
  }

  function computeEpsilon(CL, AR) {
    if (!CL || !AR) return null;
    const e = 0.75;
    return ((2 * CL) / (Math.PI * AR * e)) * 180 / Math.PI;
  }

  useEffect(() => {
    if (coefficients.CL && parsedCpData && selectedLevel) {
      const AR = computeAspectRatio(parsedCpData, selectedLevel);
      const eps = computeEpsilon(coefficients.CL, AR);
      setEpsilon(eps);
    }
  }, [coefficients.CL, parsedCpData, selectedLevel]);

  // --- MAIN RETURN ---
  return (
    <div className="h-screen w-screen flex flex-col bg-blue-50 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-blue-200 shadow-sm">
        <div className="flex items-center space-x-4">
          <button
            className="p-2 hover:bg-blue-50 rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-300"
            onClick={() => setIsExplorerOpen(!isExplorerOpen)}
            title={isExplorerOpen ? 'Hide file explorer' : 'Show file explorer'}
          >
            <svg className={`w-5 h-5 text-blue-600 transition-transform duration-200 ${isExplorerOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <h1 className="text-xl font-semibold text-gray-800">Post-Processing Module</h1>
        </div>
        <div className="flex items-center space-x-3">
          <label className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all duration-200 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 cursor-pointer">
            Import .vfp File
            <input type="file" accept=".vfp,application/json" className="hidden" onChange={handleVfpFileUpload} />
          </label>
          <label className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all duration-200 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 cursor-pointer">
            Contour Plots
            <button className="hidden" onClick={handleContourPlotClick} />
          </label>
          <button
            onClick={handleNavigateToProWim}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-all duration-200 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            title="Open ProWiM with polars"
          >
            ProWiM
          </button>
          <button
            onClick={handleRemoveVfp}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            title="Close VFP"
          >
            Close VFP
          </button>
          <button
            onClick={() => { setSelectedFiles({ dat: null, cp: null, forces: null }); navigate('/') }}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-all duration-200 font-medium focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2"
          >
            Back to Main
          </button>
        </div>
      </div>
      {/* Main layout: File Explorer | Main Plot | Right Sidebar */}
      <div className="flex flex-1 overflow-hidden h-full w-full">
        {/* File Explorer Sidebar */}
        <div
          className={`bg-white border-r border-blue-200 transition-all duration-300 ${isExplorerOpen ? '' : 'w-0'} overflow-auto`}
          style={{
            width: isExplorerOpen ? `${explorerWidth}px` : '0px',
            minWidth: isExplorerOpen ? `${explorerWidth}px` : '0px',
            position: 'relative'
          }}
        >
          {renderFileExplorer()}
          {isExplorerOpen && (
            <div
              ref={resizeRef}
              className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-400 transition-colors duration-200 ${isResizing ? 'bg-blue-400' : 'bg-blue-200'}`}
              onMouseDown={handleMouseDown}
              style={{ right: 0, top: 0 }}
            />
          )}
        </div>
        {/* Main Content Area */}
        <div
          className="flex-1 flex flex-col relative h-full min-w-0"
          style={{
            transition: 'margin-left 0.3s',
            height: '100%',
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          {showMesh && meshData ? (
            <div className="flex-1 bg-white">
              <Plot
                data={meshData.data}
                layout={meshData.layout}
                config={meshData.config}
                style={{ width: '100%', height: '100%' }}
                useResizeHandler={true}
              />
            </div>
          ) : showSpanwiseDistribution && spanwiseData ? (
            <div className="flex-1 flex flex-col">
              <div className="flex-1 bg-white">
                <Plot
                  data={spanwiseData.data}
                  layout={spanwiseData.layout}
                  config={spanwiseData.config}
                  style={{ width: '100%', height: '100%' }}
                  useResizeHandler={true}
                />
              </div>
              <div className="flex-1 bg-white border-t border-blue-200">
                {plotData2 ? (
                  <Plot
                    data={plotData2.data}
                    layout={plotData2.layout}
                    config={plotData2.config}
                    style={{ width: '100%', height: '100%' }}
                    useResizeHandler={true}
                  />
                ) : (
                  <div className="h-full bg-blue-50 flex items-center justify-center">
                    <p className="text-gray-500">No plot data available</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col">
              <div className="flex-1 bg-white">
                {plotData1 ? (
                  <Plot
                    data={plotData1.data}
                    layout={plotData1.layout}
                    config={plotData1.config}
                    style={{ width: '100%', height: '100%' }}
                    useResizeHandler={true}
                  />
                ) : (
                  <div className="h-full bg-blue-50 flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-blue-400 mb-3">
                        <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                      </div>
                      <p className="text-gray-500 font-medium">Select files and configure options to display plots</p>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex-1 bg-white border-t border-blue-200">
                {plotData2 ? (
                  <Plot
                    data={plotData2.data}
                    layout={plotData2.layout}
                    config={plotData2.config}
                    style={{ width: '100%', height: '100%' }}
                    useResizeHandler={true}
                  />
                ) : (
                  <div className="h-full bg-blue-50 flex items-center justify-center">
                    <p className="text-gray-500">No plot data available</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        {/* Right Sidebar */}
        <div
          className="bg-white border-l border-blue-200 flex flex-col overflow-y-auto"
          style={{
            minWidth: '320px',
            width: '320px',
            maxWidth: '400px',
            height: '100%',
            zIndex: 10
          }}
        >
          {/* Controls Section */}
          <div className="p-4 border-b border-blue-200 bg-blue-50">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Analysis Tools</h3>
            <div className="space-y-3">
              <button
                className={`w-full px-4 py-2.5 rounded-lg font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 ${showMesh
                  ? 'bg-blue-600 text-white shadow-sm focus:ring-blue-500'
                  : 'bg-white border border-blue-300 hover:bg-blue-50 text-blue-700 focus:ring-blue-300'
                  }`}
                onClick={handleMeshClick}
              >
                {showMesh ? 'Hide Mesh' : 'Show Mesh'}
              </button>
              <button
                className={`w-full px-4 py-2.5 rounded-lg font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 ${showSpanwiseDistribution
                  ? 'bg-blue-600 text-white shadow-sm focus:ring-blue-500'
                  : 'bg-white border border-blue-300 hover:bg-blue-50 text-blue-700 focus:ring-blue-300'
                  }`}
                onClick={handleSpanwiseDistributionClick}
              >
                {showSpanwiseDistribution ? 'Hide Spanwise' : 'Spanwise Distribution'}
              </button>
            </div>
          </div>
          {/* Configuration Section */}
          <div className="p-4 border-b border-blue-200">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Configuration</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Level</label>
                <select
                  className="w-full px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900"
                  value={selectedLevel}
                  onChange={(e) => setSelectedLevel(e.target.value)}
                >
                  <option value="">Select Level</option>
                  {levels.map(level => (
                    <option key={level.value} value={level.value}>
                      {level.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Plot Type</label>
                <select
                  className={`w-full px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 ${showMesh || showSpanwiseDistribution ? 'opacity-50 cursor-not-allowed' : ''}`}
                  value={selectedPlotType}
                  onChange={(e) => setSelectedPlotType(e.target.value)}
                  disabled={showMesh || showSpanwiseDistribution}
                >
                  <option value="Mach">Mach</option>
                  <option value="Cp">Cp</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Section</label>
                <select
                  className={`w-full px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 ${showMesh ? 'opacity-50 cursor-not-allowed' : ''}`}
                  value={selectedSection}
                  onChange={(e) => setSelectedSection(e.target.value)}
                  disabled={showMesh}
                >
                  <option value="">Select Section</option>
                  {sections.map(section => (
                    <option key={section.value} value={section.value}>
                      {section.label}
                    </option>
                  ))}
                </select>
              </div>
              {showSpanwiseDistribution && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Coefficient</label>
                  <select
                    className="w-full px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900"
                    value={selectedSpanwiseCoeff}
                    onChange={(e) => setSelectedSpanwiseCoeff(e.target.value)}
                  >
                    <option value="CL">CL</option>
                    <option value="CD">CD</option>
                    <option value="CM">CM</option>
                    <option value="Load">Load</option>
                  </select>
                </div>
              )}
            </div>
          </div>
          {/* Coefficients Section */}
          <div className="p-4 flex-1">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Aerodynamic Coefficients</h3>
            <div className="space-y-3 mb-6">
              <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-gray-700">CL</span>
                  <span className="font-mono text-gray-900 text-sm">{coefficients.CL?.toFixed(6) || 'N/A'}</span>
                </div>
              </div>
              <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-gray-700">CD</span>
                  <span className="font-mono text-gray-900 text-sm">{coefficients.CD?.toFixed(6) || 'N/A'}</span>
                </div>
              </div>
              <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-gray-700">CM</span>
                  <span className="font-mono text-gray-900 text-sm">{coefficients.CM?.toFixed(6) || 'N/A'}</span>
                </div>
              </div>
            </div>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Drag Breakdown</h3>
            <div className="space-y-3">
              <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-gray-700">CD Induced</span>
                  <span className="font-mono text-gray-900 text-sm">{dragBreakdown.cdInduced?.toFixed(6) || 'N/A'}</span>
                </div>
              </div>
              <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-gray-700">CD Viscous</span>
                  <span className="font-mono text-gray-900 text-sm">{dragBreakdown.cdViscous?.toFixed(6) || 'N/A'}</span>
                </div>
              </div>
              <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-gray-700">CD Wave</span>
                  <span className="font-mono text-gray-900 text-sm">{dragBreakdown.cdWave?.toFixed(6) || 'N/A'}</span>
                </div>
              </div>
            </div>
          </div>
          {/* Epsilon */}
          <div className="p-4">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Downwash Angle (Epsilon)</h3>
            <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
              <div className="flex justify-between items-center">
                <span className="font-medium text-gray-700">Epsilon</span>
                <span className="font-mono text-gray-900 text-sm">
                  {epsilon !== null && !isNaN(epsilon) ? epsilon.toFixed(5) : 'N/A'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PostProcessing;
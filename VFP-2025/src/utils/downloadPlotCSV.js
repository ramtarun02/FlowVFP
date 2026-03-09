/**
 * Extracts data from Plotly traces and triggers a CSV download.
 * Supports 2D (scatter) and 3D (surface, scatter3d) trace types.
 */
export function downloadPlotDataAsCSV(plotData, filename = 'plot-data') {
  if (!plotData || !plotData.data || plotData.data.length === 0) return;

  const traces = plotData.data;
  const firstType = (traces[0].type || 'scatter').toLowerCase();

  let csvContent;

  if (firstType === 'surface') {
    // Surface plot: x is 1D or 2D grid, y is 1D or 2D grid, z is 2D, surfacecolor is 2D
    csvContent = buildSurfaceCSV(traces[0]);
  } else if (firstType === 'scatter3d') {
    csvContent = build3DScatterCSV(traces);
  } else {
    // 2D scatter / line traces
    csvContent = build2DScatterCSV(traces);
  }

  triggerDownload(csvContent, `${filename}.csv`);
}

function build2DScatterCSV(traces) {
  // Find the maximum length across all traces
  const maxLen = Math.max(...traces.map(t => (t.x ? t.x.length : 0)));
  const headers = [];
  traces.forEach(t => {
    const name = t.name || 'trace';
    headers.push(`${name}_x`, `${name}_y`);
  });

  const rows = [headers.join(',')];
  for (let i = 0; i < maxLen; i++) {
    const row = [];
    traces.forEach(t => {
      row.push(t.x && t.x[i] != null ? t.x[i] : '');
      row.push(t.y && t.y[i] != null ? t.y[i] : '');
    });
    rows.push(row.join(','));
  }
  return rows.join('\n');
}

function build3DScatterCSV(traces) {
  const maxLen = Math.max(...traces.map(t => (t.x ? t.x.length : 0)));
  const headers = [];
  traces.forEach(t => {
    const name = t.name || 'trace';
    headers.push(`${name}_x`, `${name}_y`, `${name}_z`);
  });

  const rows = [headers.join(',')];
  for (let i = 0; i < maxLen; i++) {
    const row = [];
    traces.forEach(t => {
      row.push(t.x && t.x[i] != null ? t.x[i] : '');
      row.push(t.y && t.y[i] != null ? t.y[i] : '');
      row.push(t.z && t.z[i] != null ? t.z[i] : '');
    });
    rows.push(row.join(','));
  }
  return rows.join('\n');
}

function buildSurfaceCSV(trace) {
  // z is a 2D array [rows][cols]
  // x, y can be 1D arrays used as column/row labels, or 2D
  const z = trace.z || [];
  const surfacecolor = trace.surfacecolor;
  const x = trace.x || [];
  const y = trace.y || [];

  const rows = [];
  // Header: YAVE, then XPHYS values
  const xLabels = Array.isArray(x[0]) ? x[0] : x;
  rows.push(['YAVE', ...xLabels.map((v, i) => `XPHYS_${i}`)].join(','));

  for (let i = 0; i < z.length; i++) {
    const yVal = Array.isArray(y[0]) ? (y[i] ? y[i][0] : i) : (y[i] != null ? y[i] : i);
    const zRow = z[i] || [];
    const colorRow = surfacecolor ? (surfacecolor[i] || []) : [];
    if (surfacecolor) {
      rows.push([yVal, ...colorRow].join(','));
    } else {
      rows.push([yVal, ...zRow].join(','));
    }
  }
  return rows.join('\n');
}

function triggerDownload(csvContent, filename) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

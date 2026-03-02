import React, { useState } from 'react';
import Plot from 'react-plotly.js';

// Camera presets for standard views
const CAMERA_PRESETS = {
  isometric: { eye: { x: 1.5, y: 1.5, z: 1.5 }, up: { x: 0, y: 0, z: 1 } },
  left: { eye: { x: 0, y: -2.5, z: 0 }, up: { x: 0, y: 0, z: 1 } },
  right: { eye: { x: 0, y: 2.5, z: 0 }, up: { x: 0, y: 0, z: 1 } },
  front: { eye: { x: -2.5, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 } },
  back: { eye: { x: 2.5, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 } },
  top: { eye: { x: 0, y: 0, z: 2.5 }, up: { x: 0, y: 1, z: 0 } },
  bottom: { eye: { x: 0, y: 0, z: -2.5 }, up: { x: 0, y: -1, z: 0 } },
  dimetric: { eye: { x: 2, y: 1, z: 1.5 }, up: { x: 0, y: 0, z: 1 } },
  trimetric: { eye: { x: 2, y: 1.5, z: 1 }, up: { x: 0, y: 0, z: 1 } },
};

const Plot3D = ({ plotData, selectedSection, layout }) => {
  const [selectedView, setSelectedView] = useState('isometric');
  const camera = CAMERA_PRESETS[selectedView];

  // Default 3D scene layout
  const defaultSceneLayout = {
    aspectmode: 'data',
    xaxis: { title: { text: 'Chordwise (X)', font: { family: 'Times New Roman' } }, showgrid: true, showaxes: true },
    yaxis: { title: { text: 'Spanwise (Y)', font: { family: 'Times New Roman' } }, showgrid: true, showaxes: true },
    zaxis: { title: { text: 'Thickness (Z)', font: { family: 'Times New Roman' } }, showgrid: true, showaxes: true },
    camera: camera,
  };

  const finalLayout = {
    ...(layout || {}),
    scene: { ...(layout?.scene || defaultSceneLayout), camera },
    margin: { l: 25, r: 10, t: 50, b: 25 },
    font: { family: 'Times New Roman' },
    paper_bgcolor: '#f9fafb',
    plot_bgcolor: '#f9fafb',
  };

  // Constrain rotation: disable drag/pan, allow only zoom
  const config = {
    responsive: true,
    scrollZoom: true,
    displayModeBar: true,
    displaylogo: false,
    modeBarButtonsToRemove: ['orbitRotation', 'pan3d', 'resetCameraLastSave3d'],
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* View Dropdown */}
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10 }}>
        <select
          value={selectedView}
          onChange={e => setSelectedView(e.target.value)}
          style={{
            padding: '4px 8px',
            background: '#e3e8ef',
            border: '1px solid #b6c2d9',
            borderRadius: '4px',
            fontSize: '12px',
            cursor: 'pointer'
          }}
        >
          {Object.keys(CAMERA_PRESETS).map(view => (
            <option key={view} value={view}>
              {view.charAt(0).toUpperCase() + view.slice(1)}
            </option>
          ))}
        </select>
      </div>
      {/* Plotly 3D Plot */}
      <Plot
        data={plotData}
        layout={finalLayout}
        useResizeHandler={true}
        config={config}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
};

export default Plot3D;
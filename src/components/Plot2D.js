import React from 'react';
import Plot from 'react-plotly.js';

function Plot2D({ plotData, selectedSection, selected2DPlot }) {
  if (!plotData || plotData.length === 0) {
    return <div style={{ minHeight: '300px', textAlign: 'center', padding: '40px' }}>No 2D plot data available.</div>;
  }

  // Dynamic layout based on selected2DPlot
  let layout = {
    title: { text: '2D Plot' },
    xaxis: { title: 'X', showgrid: true, zeroline: false, font: { family: 'Times New Roman' } },
    yaxis: { title: 'Z', showgrid: true, zeroline: false, font: { family: 'Times New Roman' } },
    margin: { l: 60, r: 30, b: 50, t: 50 },
    legend: { orientation: 'h', y: -0.2 },
    autosize: true,
    paper_bgcolor: '#f9fafb',
    plot_bgcolor: '#f9fafb',
    font: { family: 'Times New Roman' }
  };

  if (selected2DPlot === 'twist') {
    layout.title = { text: 'Twist Distribution' };
    layout.xaxis.title = { text: 'Section' };
    layout.yaxis.title = { text: 'Twist [deg]' };
  } else if (selected2DPlot === 'dihedral') {
    layout.title = { text: 'Dihedral Distribution' };
    layout.xaxis.title = 'Section';
    layout.yaxis.title = { text: 'Dihedral HSECT [-]' };
  } else if (selected2DPlot === 'section' && selectedSection >= 0) {
    layout.title = { text: `Section ${selectedSection + 1} Airfoil Shape` };
    layout.xaxis.title = { text: 'Chordwise (X)' };
    layout.yaxis.title = { text: 'Thickness (Z)' };
  }

  return (
    <Plot
      data={plotData}
      layout={layout}
      config={{ responsive: true }}
      style={{ width: '100%', height: '100%', marginTop: '1rem' }}
    />
  );
}

export default Plot2D;

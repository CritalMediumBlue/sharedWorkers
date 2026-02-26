import { createPlotOptions } from './plotOptions.js';

/**
 * Initializes the plot visualization
 * @param {Object} Chart - Chart.js library
 * @param {Object} previusVars - Variables containing species data
 * @returns {Object} - Reference to the created chart
 */
export function setupPlot(Chart, previusVars, coloringRule) {
  const Id = 'plot-overlay';
  const plotContainer = document.getElementById(Id);
  
  plotContainer.innerHTML = '';
  
  const canvas = document.createElement('canvas');
  canvas.width = plotContainer.clientWidth;
  canvas.height = plotContainer.clientHeight;
  plotContainer.appendChild(canvas);
  
  const ctx = canvas.getContext('2d');
  const options = createPlotOptions();
  
  const chartData = {
    labels: [],
    datasets: generateDatasets(previusVars.int, coloringRule)
  };
  
  return new Chart(ctx, {
    type: 'line',
    data: chartData,
    options: options
  });
}


/**
 * Generates datasets for each species with distinct colors
 */
function generateDatasets(intVars, colorRule) {
  const datasets = [];

  Object.keys(intVars).forEach(species => {
    let color = colorRule[species];
    const cssColor = `rgba(${color.r}, ${color.g}, ${color.b}, 0.9)`;
    
    datasets.push({
      label: species,
      data: [],
      borderColor: cssColor,
      backgroundColor: cssColor,
      borderWidth: 2.5,
      fill: false,
      tension: 0.1,
      pointRadius: 0,
      order: 0,
      zIndex: 10
    });
  });
  
  return datasets;
}

export function updatePlot(data, chart, colorRule) {
    if (!data) return;
    
    const means = data[0];
    
    const numberOfSpecies = means.length - 1;
    
    const endMean = means[0].length;
    const startMean = Math.max(0, endMean - 500);
    
    const slicedDataMean = sliceData(startMean, endMean, means);
    
    chart.data.labels = slicedDataMean[0];
    
    for (let i = 0; i < numberOfSpecies; i++) {
        if (slicedDataMean[i+1]) {
            chart.data.datasets[i].data = slicedDataMean[i+1];
        }
    }
    
    if (colorRule) {
        for (let i = 0; i < numberOfSpecies; i++) {
            const dataset = chart.data.datasets[i];
            if (dataset && dataset.label) {
                const speciesName = dataset.label;
                const colorObj = colorRule[speciesName];
                
                if (colorObj) {
                    const cssColor = `rgba(${colorObj.r}, ${colorObj.g}, ${colorObj.b}, 0.9)`;
                    dataset.borderColor = cssColor;
                    dataset.backgroundColor = cssColor;
                }
            }
        }
    }
    
    chart.update();
}

/**
 * Slices a specific range of data points from arrays
 */
function sliceData(start, end, data) {
  let d = [];
  for (let i = 0; i < data.length; i++) {
      d.push(data[i].slice(start, end));
  }
  return d;
}

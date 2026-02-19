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
      label: species + ' [nM]',
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
    
    let means = data[0];
    let stdDevs = data[1];
    
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
                const speciesName = dataset.label.replace(' [nM]', '');
                const colorObj = colorRule[speciesName];
                
                if (colorObj) {
                    const cssColor = `rgba(${colorObj.r}, ${colorObj.g}, ${colorObj.b}, 0.9)`;
                    dataset.borderColor = cssColor;
                    dataset.backgroundColor = cssColor;
                }
            }
        }
    }
    
    const slicedSD = sliceData(startMean, endMean, stdDevs);
    
    const upperBounds = [];
    const lowerBounds = [];
    
    for (let i = 0; i < numberOfSpecies; i++) {
        upperBounds[i] = [];
        lowerBounds[i] = [];
        
        if (slicedDataMean[i+1] && slicedSD[i+1]) {
            for (let j = 0; j < slicedDataMean[i+1].length; j++) {
                upperBounds[i].push(slicedDataMean[i+1][j] + slicedSD[i+1][j]/2);
                lowerBounds[i].push(Math.max(0, slicedDataMean[i+1][j] - slicedSD[i+1][j]/2));
            }
        }
    }
    
    for (let i = 0; i < numberOfSpecies; i++) {
        const datasetIndex = numberOfSpecies + (i * 2);
        let fillColor = chart.data.datasets[i].backgroundColor;
        
        createFilledAreaDataset(
            chart, 
            datasetIndex, 
            `${chart.data.datasets[i].label} (±SD)`, 
            fillColor, 
            upperBounds[i], 
            lowerBounds[i]
        );
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

/**
 * Creates a filled area dataset between upper and lower bounds
 */
function createFilledAreaDataset(chart, index, label, color, upperData, lowerData) {
  const cssColor = color.replace(/rgba?\([^)]+\)/, match => {
    const values = match.match(/[\d.]+/g);
    return `rgba(${values[0]}, ${values[1]}, ${values[2]}, 0.3)`;
  });

  if (!chart.data.datasets[index]) {
    chart.data.datasets[index] = {
      label: label,
      data: upperData,
      borderColor: 'white', 
      backgroundColor: cssColor,
      fill: '+1',
      tension: 0.1,
      pointRadius: 0,
      borderWidth: 1, 
      order: 2
    };
  } else {
    chart.data.datasets[index].data = upperData;
    chart.data.datasets[index].backgroundColor = cssColor;
  }

  if (!chart.data.datasets[index + 1]) {
    chart.data.datasets[index + 1] = {
      label: '', 
      data: lowerData,
      borderColor: 'white', 
      pointRadius: 0,
      borderWidth: 1,
      tension: 0.1,
      order: 2
    };
  } else {
    chart.data.datasets[index + 1].data = lowerData;
  }
}

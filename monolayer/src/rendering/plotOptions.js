export function createPlotOptions() {
    const axisTextColor = "rgb(255, 255, 255)";
    const gridColor = "rgba(255, 255, 255, 0.4)"; 
    
    return {
        responsive: false,
        maintainAspectRatio: false,
        animation: {
            duration: 0
        },
        plugins: {
            title: {
                display: true,
                text: "Average intracellular concentrations",
                color: axisTextColor,
                font: {
                    size: 16
                }
            },
            legend: {
                position: 'right',
                labels: {
                    color: axisTextColor,
                    font: {
                        family: 'Arial',
                        size: 12
                    },
                    filter: function(item) {
                        return item.text !== '' && !item.text.includes('±SD');
                    }
                }
            },
            tooltip: {
                callbacks: {
                    label: function(context) {
                        const label = context.dataset.label || '';
                        const value = context.parsed.y;
                        
                        if (label.includes('±SD') || label === '') {
                            return null;
                        }
                        
                        return `${label}: ${value.toFixed(2)}`;
                    }
                }
            }
        },
        scales: {
            x: {
                ticks: {
                    color: axisTextColor,
                    font: {
                        family: 'Arial',
                        size: 12
                    }
                },
                grid: {
                    display: false,
                    color: gridColor
                }
            },
            y: {
                beginAtZero: false,
                ticks: {
                    color: axisTextColor,
                    font: {
                        family: 'Arial',
                        size: 12
                    }
                },
                grid: {
                    display: true,
                    color: gridColor
                }
            }
        }
    };
}

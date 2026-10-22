
export function processFileData(fileContent, fallbackTitle = 'Unknown Title') {
    let bacteriaTimeSeries = [];
    let bacteriaLineage;

   
    const data = JSON.parse(fileContent);
    const fileTitle = fallbackTitle || "Unknown Title";

    // Process  data object
    Object.entries(data).forEach(([timeStep, bacteria]) => {
        if (timeStep === "lineage" ) {
            bacteriaLineage = bacteria;
            return; // Skip the first entry
            }

        const bacteriaInTimeSlice= bacteria.map(bacterium => (
            { 
            id: bacterium.id,
            y: Math.round((bacterium.y - 170)*10)/10,
            x: Math.round(bacterium.x*10)/10,
            angle: Math.round(bacterium.an*50)/50,
            longAxis: Math.round(bacterium.le),
        }
    ));  

        for (const bacterium of bacteriaInTimeSlice) {
            Object.seal(bacterium);
            Object.preventExtensions(bacterium);
        }

        bacteriaTimeSeries.push(bacteriaInTimeSlice);
    });

    const averageLifetime = analyzeBacteriaLineage(bacteriaTimeSeries, bacteriaLineage);


    return {bacteriaTimeSeries,averageLifetime,bacteriaLineage,fileTitle};
}


function analyzeBacteriaLineage(bacteriaTimeSeries, bacteriaLineage) {
    
    const AllIDs = new Set();
    const AllParents = new Set();
    for (const bacteriaInTimeSlice of bacteriaTimeSeries) {
        for (const bacterium of bacteriaInTimeSlice) {
          AllIDs.add(bacterium.id);
          const parent = bacteriaLineage[bacterium.id]
          AllParents.add(parent)
        }
      }
    if (AllIDs.size != Object.keys(bacteriaLineage).length){
        console.warn("The number of unique IDs is not the same as in the lineage")
    }
 

    const bacteriaWithParentsandChildren = new Set();
    for (const bacteriaInTimeSlice of bacteriaTimeSeries) {
        for (const bacterium of bacteriaInTimeSlice) {
            const parent = bacteriaLineage[bacterium.id]
            
            if (parent !== 0 && AllParents.has(bacterium.id)) {
                bacteriaWithParentsandChildren.add(bacterium.id);
            }
        }
    }
    const lifetimes = new Map();
    for (let timeIndex = 0; timeIndex < bacteriaTimeSeries.length; timeIndex++) {
        for (const bacterium of bacteriaTimeSeries[timeIndex]) {
            if (bacteriaWithParentsandChildren.has(bacterium.id)) {
                if (!lifetimes.has(bacterium.id)) {
                    lifetimes.set(bacterium.id, [timeIndex, timeIndex]);
                } else {
                    lifetimes.get(bacterium.id)[1] = timeIndex;
                }
            }
        }
    }

    // Calculate average lifetime
    let sum = 0;
    let count = 0;
    lifetimes.forEach((value) => {
        // a cell present from frame first to frame last (inclusive) lives
        // last - first + 1 frames between its birth and its division
        sum += value[1] - value[0] + 1;
        count++;
    });
    const averageLifetime = sum / count ;

    if (averageLifetime < 1 || isNaN(averageLifetime)) {
        console.warn("Average lifetime is less than 1 time step, which may indicate an issue with the data or lineage mapping. defaulting to 1 time step.")
        return 45;
    }

    return averageLifetime
}

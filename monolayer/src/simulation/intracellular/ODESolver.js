export function simulateConcentrations(speciesNames,
  interiorManager,
  variables,
  parameters,
  intEquations,
  ID,
  timeLapse,
  ) {
    for (let i = 0, len = speciesNames.length; i < len; i++) {
        const speciesName = speciesNames[i];
        const manager = interiorManager[speciesName];
        const origConc = manager.get(ID);
        const delta = intEquations[speciesName](variables, parameters);
        let newConc = origConc + delta * timeLapse;
        if (newConc < 0) {
            newConc = 1e-14;
        }
        manager.set(ID, newConc);
        // Keep variables in sync so subsequent species in the same step
        // (and subsequent sub-steps) see the updated concentration.
        variables.int[speciesName].val = newConc;
    }
}

export function secretedSpeciesUpdate(
    variables,
    parameters,
    secretedSpecies,
    exteriorManager,
    extEquations,
    ID,
    idx,
    concentrationsState,
    dx
) {
    const squareDx = dx * dx;
    for (let i = 0, len = secretedSpecies.length; i < len; i++) {
        const speciesName = secretedSpecies[i];
        const concState = concentrationsState[speciesName]; // Cache the lookup
        concState.sources[idx] += extEquations[speciesName](variables, parameters) / squareDx ;
        concState.sinks[idx] += parameters.Kin / squareDx ;
        exteriorManager[speciesName].set(ID, concState.conc[idx]);
    }
} 

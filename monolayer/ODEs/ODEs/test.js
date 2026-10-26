// ~/~ begin <<partII/equations.qmd#lst-first>>[init]

// ~/~ begin <<partII/equations.qmd#ODE-Analogic-Increasing>>[init]
window.vars = {
    int: {
 
        S: {
            val: (() => window.params.S_initial),
            eq: (vars, params) => params.Kin * vars.ext.S.val - params.Kc * ( vars.int.S.val * vars.int.R.val ) - vars.int.S.val * params.alpha
        },
        R: {
            val: (() => window.params.R_initial),
            eq: (vars, params) => params.pR*(vars.int.producer.val !== 1) - params.Kc * ( vars.int.S.val * vars.int.R.val ) - vars.int.R.val*params.alpha
        }, 
        G: {
            val: (() => window.params.G_initial),
            eq: (vars, params) => params.P0 * ( params.beta +  (vars.int.R.val / params.K)**params.n / ( 1 + (vars.int.R.val / params.K)**params.n )  )*(vars.int.producer.val !== 1) - params.alpha*vars.int.G.val
        },
        producer: {
            val: (() => Math.random() > window.params.prodInit ? 0 : 1),
            eq: (vars, params) =>   0
        }
    },

    ext: {
        S: {
            val: (() => 0),
            eq: (vars, params) => (params.secrete)  * (vars.int.producer.val === 1)
        }
    }
};
 
// ~/~ end
// ~/~ begin <<partII/equations.qmd#parameters-Analogic-Increasing>>[init]
window.params = {
    TIME_SCALE_SECONDS: 3895.2944,
    ODE_TIME_STEP: 0.002,
    ADI_TIME_STEP: 0.0002,
    secrete: 500.8,
    Kin: 17185.123,      // uptake rate — required by secretedSpeciesUpdate
    K: 30,
    DiffusionRate: 45826.994,
    Kc:  100,
    pR: 500,
    prodInit: 0.5,
    S_initial: 0,
    R_initial: 0,
    G_initial: 0,
    P0:1840,
    alpha: 20,
    beta: 0.06,         // basal expression level
    n: 3.4,              // Hill coefficient
    }
// ~/~ end

// ~/~ end

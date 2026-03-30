
window.vars = {
    int: {
 
        P: {
            val: (() => window.params.P_initial), 
            eq: (vars, params) => params.Kin * vars.ext.P.val - params.Kcomp * ( vars.int.P.val * vars.int.R.val ) - vars.int.P.val 
        },
        R: { 
            val: (() => window.params.R_initial), 
            eq: (vars, params) => 
                 params.Synthesis*(params.min + vars.int.R.val / (1 + vars.int.R.val))*(vars.int.producer.val !== 1) - params.Kcomp * ( vars.int.P.val * vars.int.R.val ) - vars.int.R.val 
        },
        F: {
            val: (() => window.params.F_initial),
            eq: (vars, params) => 
                (params.RFP_prod * vars.int.R.val / (1 + vars.int.R.val))*(vars.int.producer.val !== 1) -  vars.int.F.val   
        },        
        producer: {
            val: (() => Math.random() > window.params.prodInit ? 0 : 1), //half of the bacteria will be producers (1) and the other half, recievers (0)
            eq: (vars, params) =>   0 //This means, this value does not change
        }
    },

    ext: {
        P: {
            val: (() => 0), 
            eq: (vars, params) => 
                (params.secrete)  * (vars.int.producer.val === 1)   //Pi group secretion  
        }
    }
};
 
window.params = {
    // t_scale = 1/dilution rate = 1/0.00025672 s = 3895.2944 s, so we multiply all dimensional rates by this number to get non-dimensional rates.
    // The engine multiplies dimensional seconds by (1 / TIME_SCALE_SECONDS) to get non-dimensional time.
    TIME_SCALE_SECONDS: 3895.2944,
    ODE_TIME_STEP: 0.002,   // non-dimensional time units — safe given slowest rate Kbind ≈ 0.002 (stability limit ~469)
    ADI_TIME_STEP: 0.0002,    // non-dimensional time units — ADI is unconditionally stable for diffusion
    secrete: 4.583,   
    Kin: 17185.123, // this is the non-dimensional Pi group for the uptake of the signal
    DiffusionRate: 45826.994, // this is non-dimensional Pi group for the laplacian
    Kcomp:  18.75,
    Synthesis: 1.039,
    RFP_prod: 1.039,
    prodInit: 0.5,   
    min: 0.05, 
    P_initial: 0,    //non dimensional initial concentration 
    R_initial: 0,    //non dimensional initial concentration 
    F_initial: 0,   //non dimensional initial concentration 
};

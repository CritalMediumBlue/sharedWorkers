
window.vars = {
    int: {
 
        P: {
            val: (() => window.params.P_initial), 
            eq: (vars, params) => params.Kin * vars.ext.P.val + params.Kbind * (vars.int.PR.val  -  vars.int.P.val * vars.int.R.val ) - params.Dilution * vars.int.P.val 
        },
        R: { 
            val: (() => window.params.R_initial), 
            eq: (vars, params) => 
                 params.Synthesis*(vars.int.producer.val !== 1) + params.Kbind * (vars.int.PR.val  - vars.int.P.val * vars.int.R.val ) - params.Dilution * vars.int.R.val 
        },
        PR: { 
            val: (() => window.params.PR_initial), 
            eq: (vars, params) => 
                params.Kbind * ( vars.int.P.val * vars.int.R.val - vars.int.PR.val ) - params.Dilution * vars.int.PR.val 
        },
        F: {
            val: (() => window.params.F_initial),
            eq: (vars, params) => 
                (params.RFP_prod * vars.int.R.val / (params.PiR + vars.int.R.val))*(vars.int.producer.val !== 1) - (params.Dilution * vars.int.F.val)   
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
    // t_scale = averageAreaPerBacterium / DiffusionRate = 4.8 µm² / 100 µm²/s = 0.048 s
    // The engine multiplies dimensional seconds by (1 / TIME_SCALE_SECONDS) to get non-dimensional time.
    TIME_SCALE_SECONDS: 0.048,
    ODE_TIME_STEP: 200,   // non-dimensional time units — safe given slowest rate Kbind ≈ 0.002 (stability limit ~469)
    ADI_TIME_STEP: 25,    // non-dimensional time units — ADI is unconditionally stable for diffusion
    secrete: 0.000277,   
    Kin: 0.1111, // this is the non-dimensional Pi group for the uptake of the signal
    DiffusionRate: 1, // this is non-dimensional Pi group for the laplacian
    Kbind:  0.002133,
    Dilution: 0.00001365, // non dimentional Pi group for the dilution
    Synthesis: 0.00006666,
    RFP_prod:0.0001,
    PiR: 1.25,
    prodInit: 0.5,   
    P_initial: 4.3,    //non dimensional initial concentration 
    R_initial: 7.7,    //non dimensional initial concentration 
    PR_initial: 15,  //non dimensional initial concentration 
    F_initial: 15,   //non dimensional initial concentration 
};

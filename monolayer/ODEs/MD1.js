
window.vars = {
    int: {
 
        P: {
            val: (() => window.params.P_initial), // 10 nM is the initial value. In steady state should stay between 1 and 200 nM
            eq: (vars, params) => params.Kin * vars.ext.P.val + params.Kbind * (vars.int.PR.val  -  vars.int.P.val * vars.int.R.val ) - params.Dilution * vars.int.P.val // [nM/s]
        },
        R: { 
            val: (() => window.params.R_initial), // 100 nM is the initial value. In steady state should stay between 1 and 1000 nM
            eq: (vars, params) => 
                 params.Synthesis*(vars.int.producer.val !== 1) + params.Kbind * (vars.int.PR.val  - vars.int.P.val * vars.int.R.val ) - params.Dilution * vars.int.R.val // [nM/s]
        },
        PR: { 
            val: (() => window.params.PR_initial), // 20 nM is the initial value. In steady state should stay between 1 and 100 nM
            eq: (vars, params) => 
                params.Kbind * ( vars.int.P.val * vars.int.R.val - vars.int.PR.val ) - params.Dilution * vars.int.PR.val // [nM/s]
        },
        F: {
            val: (() => window.params.F_initial),
            eq: (vars, params) => 
                (params.RFP_prod * vars.int.R.val / (params.PiR + vars.int.R.val))*(vars.int.producer.val !== 1) - (params.Dilution * vars.int.F.val)   // [nM/s]
        },        
        producer: {
            val: (() => Math.random() > window.params.prodInit ? 0 : 1), //half of the bacteria will be producers (1) and the other half, recievers (0)
            eq: (vars, params) =>   0 //This means, this value does not change
        }
    },

    ext: {
        P: {
            val: (() => 0), //several nM in steadystate
            eq: (vars, params) => 
                (params.secrete)  * (vars.int.producer.val === 1)   //secretion rate 
        }
    }
};
 
window.params = {
    secrete: 0.000277,   // nM/s
    Kin: 0.1111,
    DiffusionRate: 1, // um2/s
    Kbind:  0.002133,
    Dilution: 0.00001365,
    Synthesis: 0.00006666,
    RFP_prod:0.0001,
    PiR: 1.25,
    prodInit: 0.5,   // 50% of the bacteria are producers at the start of the simulation
    P_initial: 4.3,     // nM     (initial concentration of P)
    R_initial: 7.7,    // nM     (initial concentration of R)
    PR_initial: 15,   // nM     (initial concentration of PR)
    F_initial: 15,    // nM     (initial concentration of F)
};


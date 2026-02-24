
window.vars = {
    int: {
        P: {
            val: (() => window.params.P_initial), // 10 nM is the initial value. In steady state should stay between 1 and 200 nM
            eq: (vars, params) => params.Kin * vars.ext.P.val/params.averageAreaPerBacterium + params.Koff * vars.int.PR.val  - params.Kon * vars.int.P.val * vars.int.R.val - params.DilRate * vars.int.P.val // [nM/s]
        },
        R: { 
            val: (() => window.params.R_initial), // 100 nM is the initial value. In steady state should stay between 1 and 1000 nM
            eq: (vars, params) => 
                 params.Ksyn*(vars.int.producer.val !== 1) + params.Koff * vars.int.PR.val - params.Kon * vars.int.P.val * vars.int.R.val - params.DilRate * vars.int.R.val // [nM/s]
        },
        PR: { 
            val: (() => window.params.PR_initial), // 20 nM is the initial value. In steady state should stay between 1 and 100 nM
            eq: (vars, params) => 
                (params.Kon * vars.int.P.val * vars.int.R.val - params.Koff * vars.int.PR.val - params.DilRate * vars.int.PR.val) // [nM/s]
        },
        F: {
            val: (() => window.params.F_initial),
            eq: (vars, params) => 
                (params.KF * vars.int.R.val / (params.Kr + vars.int.R.val))*(vars.int.producer.val !== 1) - (params.DilRate * vars.int.F.val)   // [nM/s]
        }, 
        producer: {
            val: (() => Math.random() > window.params.prodInit ? 0 : 1), //half of the bacteria will be producers (1) and the other half, recievers (0)
            eq: (vars, params) =>   0 //This means, this value does not change. A producer will always be a producer and a reciever will always be a reciever. 
        }
    },

    ext: {
        P: {
            val: (() => 0), //several nM in steadystate
            eq: (vars, params) => 
                (params.Kout)  * (vars.int.producer.val === 1)   //secretion rate 
        }
    }
};
 
window.params = {
    TIME_SCALE_SECONDS: 1, // dimensional: 1 second = 1 second (no rescaling needed)
    ODE_TIME_STEP: 2,      // seconds — ODE integration step size
    ADI_TIME_STEP: 0.5,    // seconds — ADI diffusion step size
    averageAreaPerBacterium: 4.8, // um2  total microfluidic chamber area / average number of bacteria
    DiffusionRate: 90, // um2/s
    Kin:     10,    // 1/s  0.03 - 0.1
    Kout:    1,   // nM/s 
    Ksyn:    0.05,    // nM/s   (supported by literature) 0.03
    Kon:     0.001,   // nM-1 s-1 (supported by literature)
    Koff:    0.04,     // 1/s   (calculated based on the kd and the kon)
    DilRate: 0.000256, // 1/s   (in line with a 45min doubling time)
    KF:      0.1,    // nM/s   (based on literature) 10 - 75
    Kr:      50,       // nM     (based on literature)
    prodInit: 0.5,   // 50% of the bacteria are producers at the start of the simulation
    P_initial: 10,     // nM     (initial concentration of P)
    R_initial: 100,    // nM     (initial concentration of R)
    PR_initial: 100,   // nM     (initial concentration of PR)
    F_initial: 150,    // nM     (initial concentration of F)
};

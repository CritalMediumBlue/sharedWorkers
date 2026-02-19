
window.vars = {
    int: {
        
        R: {
            val: (() => 10), // 10 nM is the initial value. In steady state should stay between 1 and 200 nM
            eq: (vars, params) =>  (params.Kin * vars.ext.P.val/params.averageAreaPerBacterium + params.Koff * vars.int.PR.val  - params.Kon * vars.int.P.val * vars.int.R.val - params.DilRate * vars.int.P.val) // [nM/s]
        },
        I: { 
            val: (() => 100), // 100 nM is the initial value. In steady state should stay between 1 and 1000 nM
            eq: (vars, params) => 
                ( params.Ksyn + params.Koff * vars.int.PR.val - params.Kon * vars.int.P.val * vars.int.R.val - params.DilRate * vars.int.R.val) // [nM/s]
        },
        L: { 
            val: (() => 100), // 20 nM is the initial value. In steady state should stay between 1 and 100 nM
            eq: (vars, params) => 
                (params.Kon * vars.int.P.val * vars.int.R.val - params.Koff * vars.int.PR.val - params.DilRate * vars.int.PR.val) // [nM/s]
        },
        A: {
            val: (() => 0),
            eq: (vars, params) => 
                (params.KF * vars.int.R.val / (params.Kr + vars.int.R.val ) - params.DilRate * vars.int.F.val)   // [nM/s]
        }, 
        Ap: {
            val: (() => 0),
            eq: (vars, params) => {
                params.Kp*vars.int.A.val
            }
    },
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
    averageAreaPerBacterium: 4.8, // um2  total microfluidic chamber area / average number of bacteria
    DiffusionRate: 100, // um2/s
    Kin:     0.2,
    Ksyn:    0.3,
    Kp:     0.06,
    Kr:     0.4,
    Kon:     0.34,
    DilRate: 0.000256, // 1/s   (in line with a 45min doubling time)
    Pv: 0.07, 
    Ps: 2,
    kA: 0.8,
    kS: 0.5,

};

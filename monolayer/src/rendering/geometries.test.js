import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { setBacterialColor, updateCapsuleColor } from './geometries.js';

// The previous implementation: build a CSS rgb() string and let three.js parse it
function previousColor(concentrations, rules) {
    let r = 0, g = 0, b = 0, a = 0;
    Object.keys(concentrations).forEach((s) => {
        r += rules[s].r * concentrations[s] * rules[s].intensity;
        g += rules[s].g * concentrations[s] * rules[s].intensity;
        b += rules[s].b * concentrations[s] * rules[s].intensity;
        a += rules[s].a * concentrations[s] * rules[s].intensity;
    });
    const color = new THREE.Color(`rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`);
    return { color, opacity: a / 2, outline: color.clone().multiplyScalar(0.1) };
}

const makeCapsule = () => ({
    material: { color: new THREE.Color(), opacity: 1 },
    children: [{ material: { color: new THREE.Color() } }],
});

describe('capsule colours', () => {
    it('match the previous CSS-string colouring exactly', () => {
        const rules = {
            S: { r: 0, g: 0, b: 255, a: 1, intensity: 0.002 },
            R: { r: 0, g: 255, b: 0, a: 1, intensity: 0.0004 },
            G: { r: 255, g: 0, b: 0, a: 1, intensity: 0.01 },
            sender: { r: 255, g: 0, b: 255, a: 1, intensity: 0.5 },
        };
        Object.entries(rules).forEach(([s, c]) => setBacterialColor(s, c));
        let seed = 1;
        const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        for (let i = 0; i < 500; i++) {
            // includes values that saturate a channel above 255
            const conc = { S: rand() * 300, R: rand() * 900, G: rand() * 600, sender: rand() < 0.5 ? 0 : 1 };
            const capsule = makeCapsule();
            updateCapsuleColor(capsule, THREE, conc);
            const expected = previousColor(conc, rules);
            expect(capsule.material.color.equals(expected.color)).toBe(true);
            expect(capsule.material.opacity).toBe(expected.opacity);
            expect(capsule.children[0].material.color.equals(expected.outline)).toBe(true);
        }
    });
});

import * as THREE from 'three';

/**
 * One table drives both the GPU ocean (uniforms) and the CPU height sampler
 * used to keep the camera a fixed distance above the water.
 *
 * Four big slow swells plus two small ripple layers. Nothing choppy.
 */
export interface Wave {
  /** Direction in the XZ plane (normalised on use). */
  dir: [number, number];
  /** Amplitude in world units. */
  amplitude: number;
  /** Wavelength in world units. */
  wavelength: number;
  /** Period in seconds. */
  period: number;
  /** Gerstner steepness 0..1. Low values keep crests rounded. */
  steepness: number;
}

export const WAVES: Wave[] = [
  { dir: [1.0, 0.25], amplitude: 1.5, wavelength: 80, period: 14, steepness: 0.3 },
  { dir: [0.55, 0.85], amplitude: 0.9, wavelength: 56, period: 11.5, steepness: 0.28 },
  { dir: [-0.4, 0.9], amplitude: 0.6, wavelength: 40, period: 9.5, steepness: 0.25 },
  { dir: [0.9, -0.45], amplitude: 0.4, wavelength: 30, period: 8, steepness: 0.22 },
  { dir: [0.3, 1.0], amplitude: 0.1, wavelength: 9, period: 3.6, steepness: 0.2 },
  { dir: [-0.8, 0.5], amplitude: 0.06, wavelength: 5.5, period: 2.8, steepness: 0.15 },
];

export const NUM_WAVES = WAVES.length;

const TWO_PI = Math.PI * 2;

/** Packs the table into the two uniform arrays the vertex shader expects. */
export function waveUniforms(): { a: THREE.Vector4[]; b: THREE.Vector2[] } {
  const a: THREE.Vector4[] = [];
  const b: THREE.Vector2[] = [];
  for (const w of WAVES) {
    const d = new THREE.Vector2(w.dir[0], w.dir[1]).normalize();
    a.push(new THREE.Vector4(d.x, d.y, w.amplitude, TWO_PI / w.wavelength));
    b.push(new THREE.Vector2(TWO_PI / w.period, w.steepness));
  }
  return { a, b };
}

/**
 * Vertical displacement at a world XZ position. Ignores the horizontal
 * Gerstner shift, which is small at these steepness values.
 */
export function waveHeight(x: number, z: number, t: number): number {
  let h = 0;
  for (const w of WAVES) {
    const len = Math.hypot(w.dir[0], w.dir[1]);
    const dx = w.dir[0] / len;
    const dz = w.dir[1] / len;
    const k = TWO_PI / w.wavelength;
    const omega = TWO_PI / w.period;
    h += w.amplitude * Math.sin(k * (dx * x + dz * z) - omega * t);
  }
  return h;
}

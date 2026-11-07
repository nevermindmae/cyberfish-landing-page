import * as THREE from 'three';

/**
 * Brand colours as three.js Colors. Hex values are sRGB and three converts
 * them to linear on construction, so shaders receive linear light.
 * Source: reference/BRAND.md
 */
export const COLORS = {
  bg: new THREE.Color('#060a14'),
  skyTop: new THREE.Color('#040712'),
  skyHorizon: new THREE.Color('#0b1636'),
  waterBase: new THREE.Color('#0a1430'),
  accent: new THREE.Color('#2EA8FF'),
  fishBody: new THREE.Color('#e8edf5'),
  fishFin: new THREE.Color('#dbe6f5'),
  /** Cool key light. */
  light: new THREE.Color('#b8ccff'),
  /** Hemisphere lighting for the hero asset. Not brand tokens; lighting only. */
  hemiSky: new THREE.Color('#8691a8'),
  hemiGround: new THREE.Color('#1c2a52'),
};

/** Direction toward the key light: above, slightly camera-side. */
export const FISH_KEY_DIR = new THREE.Vector3(0.35, 0.85, 0.45).normalize();

/** Exponential-squared fog density for scene.fog. */
export const FOG_DENSITY = 0.02;

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
  /** Not a brand token: a lifted water colour for crests, derived from the horizon. */
  waterCrest: new THREE.Color('#3a5694'),
  /** Not a brand token: cool silvery sheen at grazing angles. */
  waterSheen: new THREE.Color('#56709c'),
  accent: new THREE.Color('#2EA8FF'),
  fishBody: new THREE.Color('#e8edf5'),
  fishFin: new THREE.Color('#dbe6f5'),
  eye: new THREE.Color('#0a1222'),
  /** Cool key light. */
  light: new THREE.Color('#b8ccff'),
  /** Hemisphere lighting for the fish. Not brand tokens; lighting only. */
  hemiSky: new THREE.Color('#5a6f9a'),
  hemiGround: new THREE.Color('#1c2a52'),
};

/** Direction toward the fish key light: above, slightly camera-side. */
export const FISH_KEY_DIR = new THREE.Vector3(0.35, 0.85, 0.45).normalize();

/** Exponential-squared fog density shared by the ocean shader and scene.fog. */
export const FOG_DENSITY = 0.02;

/** Direction toward the single key light (from the surface). Ahead and up. */
export const LIGHT_DIR = new THREE.Vector3(-0.35, 0.8, -0.5).normalize();

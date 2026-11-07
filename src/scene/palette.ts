import * as THREE from 'three';

/**
 * Brand colours as three.js Colors. Hex values are sRGB and three converts
 * them to linear on construction, so shaders receive linear light.
 * Source: reference/BRAND.md
 */
export const COLORS = {
  bg: new THREE.Color('#060a14'),
  accent: new THREE.Color('#2EA8FF'),
  fishBody: new THREE.Color('#e8edf5'),
  fishFin: new THREE.Color('#dbe6f5'),
  /** Cool key light. */
  light: new THREE.Color('#b8ccff'),
  /** Hemisphere lighting for the hero asset. Not brand tokens; lighting only. */
  hemiSky: new THREE.Color('#8691a8'),
  hemiGround: new THREE.Color('#1c2a52'),
};

/**
 * Ocean hero look, from assets-src/ocean/ocean_look.json (sRGB hex given there).
 * Blues and purples only: no green, yellow, orange or red anywhere.
 */
export const OCEAN = {
  /** Sky ramp, horizon band -> zenith. */
  skyHorizon: new THREE.Color('#848bcb'),
  skyLow: new THREE.Color('#5552a2'),
  skyMid: new THREE.Color('#423886'),
  skyTop: new THREE.Color('#382973'),
  skyCloudTint: new THREE.Color('#8b7cce'),
  /** Water albedo (roughness 0.06, clearcoat 0.6). */
  waterBase: new THREE.Color('#1d2755'),
  /** Water-only linear fog, 25 -> 220 m. */
  waterFog: new THREE.Color('#525f9b'),
  /** The two point lights at the fish: the only neon in the scene. */
  fishGlow: new THREE.Color('#95ceff'),
  /** Big soft overhead fill. */
  fill: new THREE.Color('#bcc4f9'),
  /** Cool white key from the camera side. */
  key: new THREE.Color('#d9e6ff'),
};

export const WATER_FOG_NEAR = 25;
export const WATER_FOG_FAR = 220;

/** Direction toward the key light: above, camera side, a little to the left. */
export const FISH_KEY_DIR = new THREE.Vector3(-0.3, 0.45, 0.85).normalize();

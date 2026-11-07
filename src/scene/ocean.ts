import * as THREE from 'three';
import { OCEAN } from './palette';

/**
 * Night sea from assets-src/ocean/ocean_look.json: dark navy satin water with
 * a clearcoat, big slow swells (Gerstner waves in the vertex shader, standing
 * in for Blender's Ocean modifier) and a fine procedural bump for sparkle.
 * Haze toward the horizon comes from scene.fog, which only the water uses.
 */

/** Swell direction from the spec, degrees from +X toward -Z. */
const DIRECTION_DEG = 35;
/** Global slowdown of the physically-derived wave speeds: dreamy, not stormy. */
const TIME_SCALE = 0.55;

interface Wave {
  /** Wavelength in metres. */
  length: number;
  /** Amplitude in metres (crest height above the mean). */
  amplitude: number;
  /** Direction offset from DIRECTION_DEG, degrees. */
  angle: number;
  /** Gerstner steepness 0..1 (sharper crests). */
  steepness: number;
}

/** Dominant swell ~80 m, a couple of cross swells, then chop. Total ~1.7 m. */
const WAVES: Wave[] = [
  { length: 84, amplitude: 0.85, angle: 0, steepness: 0.32 },
  { length: 46, amplitude: 0.45, angle: 22, steepness: 0.38 },
  { length: 23, amplitude: 0.22, angle: -31, steepness: 0.42 },
  { length: 11, amplitude: 0.1, angle: 57, steepness: 0.4 },
  { length: 5.2, amplitude: 0.04, angle: -68, steepness: 0.3 },
  { length: 2.6, amplitude: 0.015, angle: 14, steepness: 0.25 },
];

const GRAVITY = 9.81;

const WAVE_CHUNK = /* glsl */ `
#define OC_WAVES ${WAVES.length}
uniform float uTime;
// xy: direction, z: wavenumber k, w: amplitude
uniform vec4 uWaveA[OC_WAVES];
// x: angular frequency, y: steepness Q
uniform vec2 uWaveB[OC_WAVES];

// Gerstner sum (GPU Gems 1, ch. 1). Returns the displaced position and normal
// for a point on the rest plane at xz.
void oceanWave(vec2 xz, out vec3 disp, out vec3 nrm) {
  disp = vec3(0.0);
  vec3 n = vec3(0.0, 1.0, 0.0);
  for (int i = 0; i < OC_WAVES; i++) {
    vec2 d = uWaveA[i].xy;
    float k = uWaveA[i].z;
    float a = uWaveA[i].w;
    float w = uWaveB[i].x;
    float q = uWaveB[i].y;
    float phase = k * dot(d, xz) - w * uTime;
    float s = sin(phase);
    float c = cos(phase);
    disp.xz += q * a * d * c;
    disp.y += a * s;
    n.xz -= d * k * a * c;
    n.y -= q * k * a * s;
  }
  nrm = normalize(n);
}
`;

export interface OceanOptions {
  mobile: boolean;
  reducedMotion: boolean;
  /** Prefiltered sky, reflected by the water. */
  envMap: THREE.Texture;
}

export class Ocean {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshPhysicalMaterial;
  private readonly uTime: THREE.IUniform<number> = { value: 0 };
  private readonly bump: THREE.DataTexture;
  private readonly reducedMotion: boolean;

  constructor(opts: OceanOptions) {
    this.reducedMotion = opts.reducedMotion;

    const size = 900;
    const segments = opts.mobile ? 160 : 384;
    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    this.bump = makeBumpTexture(128);
    this.bump.wrapS = this.bump.wrapT = THREE.RepeatWrapping;
    this.bump.repeat.set(70, 70);

    this.material = new THREE.MeshPhysicalMaterial({
      color: OCEAN.waterBase,
      // A touch rougher than the Blender value: a directional key on a
      // mirror-smooth surface throws hard glints across the whole sea.
      roughness: 0.12,
      metalness: 0,
      clearcoat: 0.6,
      clearcoatRoughness: 0.08,
      ior: 1.33,
      envMap: opts.envMap,
      envMapIntensity: 0.8,
      normalMap: this.bump,
      normalScale: new THREE.Vector2(0.07, 0.07),
      fog: true,
    });

    const waveA = WAVES.map((w) => {
      const theta = THREE.MathUtils.degToRad(DIRECTION_DEG + w.angle);
      const k = (Math.PI * 2) / w.length;
      return new THREE.Vector4(Math.cos(theta), -Math.sin(theta), k, w.amplitude);
    });
    const waveB = WAVES.map((w) => {
      const k = (Math.PI * 2) / w.length;
      return new THREE.Vector2(Math.sqrt(GRAVITY * k) * TIME_SCALE, w.steepness);
    });

    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.uTime;
      shader.uniforms.uWaveA = { value: waveA };
      shader.uniforms.uWaveB = { value: waveB };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${WAVE_CHUNK}`)
        .replace(
          '#include <beginnormal_vertex>',
          `vec3 ocDisp; vec3 ocNormal;
          oceanWave(position.xz, ocDisp, ocNormal);
          vec3 objectNormal = ocNormal;
          #ifdef USE_TANGENT
          vec3 objectTangent = vec3(tangent.xyz);
          #endif`,
        )
        .replace('#include <begin_vertex>', 'vec3 transformed = position + ocDisp;');
    };
    this.material.customProgramCacheKey = () => 'ocean';

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    // Water sits at y = 0; the far edge is well past the fog's far distance.
    this.mesh.position.set(0, 0, -size / 2 + 150);
    this.update(this.reducedMotion ? 10 : 0);
  }

  update(time: number): void {
    if (this.reducedMotion && this.uTime.value !== 0) return;
    this.uTime.value = time;
    // Drift the fine bump slowly across the swell direction.
    this.bump.offset.set(time * 0.012, -time * 0.007);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.bump.dispose();
  }
}

/** Tileable noise normal map for the small-scale water bump. */
function makeBumpTexture(size: number): THREE.DataTexture {
  const height = new Float32Array(size * size);
  // Sum of a few random tileable sines so the texture wraps seamlessly.
  const comps: Array<[number, number, number, number]> = [];
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 14; i++) {
    comps.push([
      Math.round(1 + rnd() * 6) * (rnd() < 0.5 ? -1 : 1),
      Math.round(1 + rnd() * 6) * (rnd() < 0.5 ? -1 : 1),
      rnd() * Math.PI * 2,
      1 / (1 + i * 0.35),
    ]);
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let h = 0;
      for (const [fx, fy, ph, amp] of comps) {
        h += amp * Math.sin(((x * fx + y * fy) / size) * Math.PI * 2 + ph);
      }
      height[y * size + x] = h;
    }
  }
  const data = new Uint8Array(size * size * 4);
  const at = (x: number, y: number) =>
    height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 0.5;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 0.5;
      const n = new THREE.Vector3(-dx, -dy, 1).normalize();
      const i = (y * size + x) * 4;
      data[i] = Math.round((n.x * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round((n.y * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round((n.z * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

import * as THREE from 'three';
import raysVert from './shaders/rays.vert.glsl?raw';
import raysFrag from './shaders/rays.frag.glsl?raw';
import motesVert from './shaders/motes.vert.glsl?raw';
import motesFrag from './shaders/motes.frag.glsl?raw';

/**
 * The deep: the chapter below the surface. Near-black water, a few broad
 * shafts of light leaning down from above, and motes drifting in the dark.
 * Everything lives in `root`, laid out around the origin with the camera at
 * the origin looking down -Z; the scene places the root where the dive left
 * the camera.
 *
 * Shafts are additive planes at a few depths (so the mouse parallax gives
 * them volume); motes are one Points cloud whose motion is computed in the
 * vertex shader.
 */

export interface DeepOptions {
  mobile: boolean;
  pixelRatio: number;
}

/**
 * Shaft layers: distance in front of the camera, lean, seed, brightness,
 * and a band (centre and half-width, as a fraction of the distance, so
 * roughly a fraction of the frame's half-width) that always carries light.
 */
interface RayLayer {
  distance: number;
  angle: number;
  seed: number;
  intensity: number;
  anchor: number;
  anchorWidth: number;
}

const RAY_LAYERS: RayLayer[] = [
  { distance: 16, angle: -0.3, seed: 1.3, intensity: 1.1, anchor: 0.28, anchorWidth: 0.3 },
  { distance: 28, angle: -0.36, seed: 4.7, intensity: 1.0, anchor: -0.22, anchorWidth: 0.26 },
  { distance: 44, angle: -0.24, seed: 8.1, intensity: 0.9, anchor: 0.1, anchorWidth: 0.4 },
];
/** Plane size relative to its distance: generous, so parallax never shows an edge. */
const RAY_PLANE_HEIGHT = 1.3;
const RAY_PLANE_WIDTH = 3.2;
/** Across-shaft frequency scales with distance so all layers read alike on screen. */
const RAY_SCALE = 12;

const RAY_COLOR_DEEP = new THREE.Color('#0a2c74');
const RAY_COLOR_BRIGHT = new THREE.Color('#7fbfff');
const MOTE_COLOR = new THREE.Color('#a9d6ff');

const MOTE_COUNT = 720;
const MOTE_COUNT_MOBILE = 300;
/** Motes fill a wedge in front of the camera: this deep, this tall. */
const MOTE_DEPTH = [2, 46] as const;
const MOTE_HALF_HEIGHT = 12;

export class Deep {
  readonly root = new THREE.Group();

  private readonly rayMaterials: THREE.ShaderMaterial[] = [];
  private readonly moteMaterial: THREE.ShaderMaterial;
  private readonly geometries: THREE.BufferGeometry[] = [];

  constructor(opts: DeepOptions) {
    const layers = opts.mobile ? RAY_LAYERS.slice(0, 2) : RAY_LAYERS;
    for (const layer of layers) this.root.add(this.buildRays(layer));

    this.moteMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: opts.pixelRatio },
        uHalfHeight: { value: MOTE_HALF_HEIGHT },
        uColor: { value: MOTE_COLOR.clone() },
      },
      vertexShader: motesVert,
      fragmentShader: motesFrag,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
    });
    const motes = new THREE.Points(
      this.buildMotes(opts.mobile ? MOTE_COUNT_MOBILE : MOTE_COUNT),
      this.moteMaterial,
    );
    motes.frustumCulled = false;
    motes.renderOrder = 2;
    this.root.add(motes);
  }

  update(time: number): void {
    for (const m of this.rayMaterials) m.uniforms.uTime.value = time;
    this.moteMaterial.uniforms.uTime.value = time;
  }

  dispose(): void {
    for (const m of this.rayMaterials) m.dispose();
    this.moteMaterial.dispose();
    for (const g of this.geometries) g.dispose();
  }

  private buildRays(layer: RayLayer): THREE.Mesh {
    const height = layer.distance * RAY_PLANE_HEIGHT;
    const width = layer.distance * RAY_PLANE_WIDTH;
    const geometry = new THREE.PlaneGeometry(width, height);
    this.geometries.push(geometry);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSeed: { value: layer.seed },
        uAngle: { value: layer.angle },
        uScale: { value: RAY_SCALE / layer.distance },
        uIntensity: { value: layer.intensity },
        uSize: { value: new THREE.Vector2(width, height) },
        uAnchor: { value: layer.anchor * layer.distance },
        uAnchorWidth: { value: layer.anchorWidth * layer.distance },
        uColorDeep: { value: RAY_COLOR_DEEP.clone() },
        uColorBright: { value: RAY_COLOR_BRIGHT.clone() },
      },
      vertexShader: raysVert,
      fragmentShader: raysFrag,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
    });
    this.rayMaterials.push(material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.z = -layer.distance;
    // Shafts come from above: sit the plane a little high so its bright end
    // is at and beyond the top of the frame.
    mesh.position.y = height * 0.12;
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    return mesh;
  }

  private buildMotes(count: number): THREE.BufferGeometry {
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count * 4);
    const sizes = new Float32Array(count);
    const [near, far] = MOTE_DEPTH;
    for (let i = 0; i < count; i++) {
      const r = Math.random();
      // Mostly small sparks; some bright enough to bloom; a few big soft
      // bokeh discs close to the lens.
      const kind = r < 0.1 ? 2 : r < 0.24 ? 1 : 0;
      const depth = kind === 2 ? near + Math.random() * 8 : near + Math.random() * (far - near);
      // Wider spread further out, to keep the frustum filled.
      const halfWidth = depth * 0.62 + 1.5;
      positions[i * 3] = (Math.random() * 2 - 1) * halfWidth;
      positions[i * 3 + 1] = (Math.random() * 2 - 1) * MOTE_HALF_HEIGHT;
      positions[i * 3 + 2] = -depth;
      seeds[i * 4] = Math.random();
      seeds[i * 4 + 1] = Math.random();
      seeds[i * 4 + 2] = Math.random();
      seeds[i * 4 + 3] = kind;
      sizes[i] =
        kind === 2 ? 5 + Math.random() * 4 : kind === 1 ? 1.0 + Math.random() : 0.7 + Math.random() * 1.1;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    this.geometries.push(geometry);
    return geometry;
  }
}

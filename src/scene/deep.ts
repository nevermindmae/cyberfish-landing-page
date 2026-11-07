import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
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
 * vertex shader. The DeKoi unit (public/models/dekoi.glb) hangs on the
 * right, tipped toward the lens, and opens its lid once the chapter has
 * surfaced.
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

/**
 * The unit: real size is 9.4 cm, so it is scaled up to read at this
 * distance (about a third of the frame height). Landscape puts it on the
 * right; portrait centres it low. Tipped so the lid faces the lens, turned
 * so the long axis runs diagonally, then a slow drift on top.
 */
const DEVICE_DISTANCE = 6;
const DEVICE_SCALE = 7.5;
/** Sits a little low: the lid lifts up and toward the lens when it opens. */
const DEVICE_POS_LANDSCAPE = new THREE.Vector3(1.3, -0.3, -DEVICE_DISTANCE);
const DEVICE_POS_PORTRAIT = new THREE.Vector3(0, -0.65, -DEVICE_DISTANCE);
/**
 * The GLB's emissives are set for a bloom threshold around 1.0 with a small
 * radius; ours is wide and strong, so cap them here or the mark smears into
 * a white plate.
 */
const DEVICE_EMISSIVE_MAX = 1.6;
const DEVICE_TILT = 0.95;
const DEVICE_TURN = -0.55;
/** Model height is 3 cm with the base at y = 0: pivot about the middle. */
const DEVICE_CENTRE_Y = -0.015;
const LID_CLIP = 'DK_LidOpen';
/** Seconds after the hand-off before the lid lifts (the fade-in is ~3 s). */
const LID_OPEN_AT = 3.4;
/** The part the callout points at: the Pi's heatsink, mid-board. */
const ANCHOR_MESH = 'DK_Pi_sink';

export class Deep {
  readonly root = new THREE.Group();

  private readonly rayMaterials: THREE.ShaderMaterial[] = [];
  private readonly moteMaterial: THREE.ShaderMaterial;
  private readonly geometries: THREE.BufferGeometry[] = [];

  /** Device rig: `drift` carries the float, `tilt` and `turn` the pose. */
  private readonly drift = new THREE.Group();
  private readonly tilt = new THREE.Group();
  private device: THREE.Object3D | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private lid: THREE.AnimationAction | null = null;
  private lidOpened = false;
  /** True once the lid clip has run to its end. */
  lidOpen = false;
  /** Mesh the callout points at, and the point on it (local space). */
  private anchorMesh: THREE.Mesh | null = null;
  private readonly anchorLocal = new THREE.Vector3();

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
      // Tested against the unit's depth so the motes behind it do not show
      // through its case (the water itself writes no depth).
      depthTest: true,
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

    // Device rig and its lights. The shaft and mote shaders ignore lights,
    // so these are for the unit alone: a cool key from above on the lens
    // side, a blue rim from behind, and a faint fill so the black case has
    // some form in its shadows.
    this.drift.position.copy(DEVICE_POS_LANDSCAPE);
    this.tilt.rotation.x = DEVICE_TILT;
    this.drift.add(this.tilt);
    this.root.add(this.drift);
    const key = new THREE.DirectionalLight('#dbe8ff', 1.0);
    key.position.set(3, 7, 4).add(DEVICE_POS_LANDSCAPE);
    key.target = this.drift;
    const rim = new THREE.DirectionalLight('#2ea8ff', 2.0);
    rim.position.set(-4, 2, -8).add(DEVICE_POS_LANDSCAPE);
    rim.target = this.drift;
    const fill = new THREE.HemisphereLight('#3b5a9a', '#02050c', 0.4);
    this.root.add(key, rim, fill);
  }

  /**
   * Hang the loaded unit on the rig, hidden and closed. The caller shows it
   * with reveal() once its shaders are compiled; the lid opens in update().
   */
  setDevice(gltf: GLTF): void {
    if (this.device) return;
    const model = gltf.scene;
    model.position.y = DEVICE_CENTRE_Y;
    model.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      if (o.name === ANCHOR_MESH) {
        // Top face, centre.
        o.geometry.computeBoundingBox();
        const bb = o.geometry.boundingBox!;
        bb.getCenter(this.anchorLocal).setY(bb.max.y);
        this.anchorMesh = o;
      }
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        // The deep's fog is tuned for the water, not for a thing 6 m away.
        m.fog = false;
        if (m instanceof THREE.MeshStandardMaterial) {
          m.emissiveIntensity = Math.min(m.emissiveIntensity, DEVICE_EMISSIVE_MAX);
          // Flat polished metal (port housings, shield) catches the key as
          // a solid white face; a little roughness turns that into a sheen.
          if (m.metalness > 0.5) m.roughness = Math.max(m.roughness, 0.5);
        }
        // The case and lid are a satin black in the renders; under our key
        // the clearcoat and low roughness read as grey. Matte keeps it black.
        if (m instanceof THREE.MeshPhysicalMaterial && m.name === 'DK_LidPlastic') {
          m.clearcoat = 0;
          m.roughness = 0.65;
        }
        if (m instanceof THREE.MeshStandardMaterial && m.name === 'DK_CasePlastic') {
          m.roughness = 0.65;
        }
      }
    });
    const turn = new THREE.Group();
    turn.rotation.y = DEVICE_TURN;
    turn.scale.setScalar(DEVICE_SCALE);
    turn.visible = false;
    turn.add(model);
    this.tilt.add(turn);
    this.device = model;

    const clip = THREE.AnimationClip.findByName(gltf.animations, LID_CLIP);
    if (clip) {
      this.mixer = new THREE.AnimationMixer(model);
      const action = this.mixer.clipAction(clip);
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      // Write the closed pose now (the model may arrive open from a
      // previous visit), then hold until it is time.
      action.play();
      this.mixer.update(0);
      action.paused = true;
      this.lid = action;
      this.mixer.addEventListener('finished', () => {
        this.lidOpen = true;
      });
    }
  }

  /** Show the unit (after its programs are compiled). */
  reveal(): void {
    if (this.device?.parent) this.device.parent.visible = true;
  }

  /**
   * World position of the callout's anchor on the board. False while the
   * unit is not loaded or not yet shown.
   */
  anchor(out: THREE.Vector3): boolean {
    const mesh = this.anchorMesh;
    if (!mesh || !this.device?.parent?.visible) return false;
    mesh.updateWorldMatrix(true, false);
    mesh.localToWorld(out.copy(this.anchorLocal));
    return true;
  }

  /**
   * @param time    scene clock (drives the shaders and the drift)
   * @param dt      frame delta
   * @param since   seconds since the hand-off into the deep
   * @param aspect  camera aspect, for the device's placement
   */
  update(time: number, dt: number, since: number, aspect: number): void {
    for (const m of this.rayMaterials) m.uniforms.uTime.value = time;
    this.moteMaterial.uniforms.uTime.value = time;

    // The unit floats: a slow bob and the gentlest roll and nod.
    const at = aspect < 1 ? DEVICE_POS_PORTRAIT : DEVICE_POS_LANDSCAPE;
    this.drift.position.set(at.x, at.y + Math.sin(time * 0.45) * 0.07, at.z);
    this.drift.rotation.z = Math.sin(time * 0.31) * 0.05;
    this.drift.rotation.x = Math.sin(time * 0.23 + 1.7) * 0.035;

    if (this.lid && !this.lidOpened && since >= LID_OPEN_AT) {
      this.lidOpened = true;
      this.lid.paused = false;
    }
    this.mixer?.update(dt);
  }

  dispose(): void {
    for (const m of this.rayMaterials) m.dispose();
    this.moteMaterial.dispose();
    for (const g of this.geometries) g.dispose();
    this.mixer?.stopAllAction();
    this.device?.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) m.dispose();
    });
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
      // The shaft planes are well behind the unit; depth-tested so the
      // light does not shine through its black case.
      depthTest: true,
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

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Straight (un-posed) fish from Blender. Nose at -Z, tail at +Z, dorsal +Y.
 * Swimming is a vertex-shader wave travelling nose -> tail, so the body and
 * fins flex like a real fish instead of a rigid pose sliding around.
 * See assets-src/cyberfish/README.md.
 */
const MODEL_URL = '/models/cyberfish_straight.glb';

/** The GLB is ~6.75 units long; this brings it to ~5. */
const MODEL_SCALE = 0.75;

// Swim wave (carangiform: head barely moves, tail swings).
/** Tail beats per second. Slow koi glide. */
const BEAT_HZ = 0.55;
/** Body wavelengths along the length (< 1: most of the body is in one bend). */
const WAVELENGTHS = 0.85;
/** Lateral amplitude at the tail tip, as a fraction of body length. */
const TAIL_AMP = 0.065;
/** Head counter-sway amplitude, fraction of body length. */
const HEAD_AMP = 0.006;
/** Tail fin trails the body by this phase (radians). */
const TAIL_FIN_LAG = 0.7;

// Path: a slow loop seen from the front, so the fish shows its flank at the
// near and far points and turns toward / away from the viewer at the sides.
const LOOP_PERIOD = 56;
const LOOP_X = 2.6;
const LOOP_Z = 0.9;
const LOOP_Y = 0.3;
/** Vertical bob: amplitude and period. */
const BOB_AMPLITUDE = 0.12;
const BOB_PERIOD = 7;
/** Heading follows the path tangent with this lag (seconds). */
const HEADING_TAU = 0.9;
/** Pitch follows the vertical velocity partially. */
const PITCH_FOLLOW = 0.6;
/** Bank: roll per rad/s of heading change, and its clamp. */
const BANK_GAIN = 2.2;
const BANK_MAX = 0.3;
/** Cursor response: the loop centre and gaze drift toward the pointer. */
const CURSOR_DRIFT = new THREE.Vector2(0.6, 0.4);
const CURSOR_LOOK = new THREE.Vector2(1.2, 0.8);
const CURSOR_TAU = 1.6;

const _pos = new THREE.Vector3();
const _vel = new THREE.Vector3();
const _target = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _bankQ = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _up = new THREE.Vector3(0, 1, 0);
const _zAxis = new THREE.Vector3(0, 0, 1);
const _fwd = new THREE.Vector3();
const _prevFwd = new THREE.Vector3(0, 0, -1);

export type ProgressCallback = (fraction: number) => void;

interface SwimUniforms {
  uTime: THREE.IUniform<number>;
  uSwim: THREE.IUniform<number>;
  uNoseZ: THREE.IUniform<number>;
  uTailZ: THREE.IUniform<number>;
}

const SWIM_CHUNK = /* glsl */ `
uniform float uTime;
uniform float uSwim;
uniform float uNoseZ;
uniform float uTailZ;

// s: 0 at the nose, 1 at the tail tip. Returns lateral (x) offset in model units.
float swimS(float z) {
  return clamp((z - uNoseZ) / (uTailZ - uNoseZ), 0.0, 1.0);
}
float swimOffset(float s, float lag) {
  float len = uTailZ - uNoseZ;
  float env = ${HEAD_AMP.toFixed(4)} + ${TAIL_AMP.toFixed(4)} * s * s;
  float phase = s * ${(Math.PI * 2 * WAVELENGTHS).toFixed(4)} - uTime * ${(Math.PI * 2 * BEAT_HZ).toFixed(4)} - lag;
  return len * env * sin(phase) * uSwim;
}
float swimSlope(float s, float lag) {
  // d(offset)/dz, by finite difference along the body.
  float len = uTailZ - uNoseZ;
  float e = 0.01;
  return (swimOffset(s + e, lag) - swimOffset(s - e, lag)) / (2.0 * e * len);
}
`;

function patchMaterial(material: THREE.Material, uniforms: SwimUniforms, lag: number): void {
  material.customProgramCacheKey = () => `swim-${lag}`;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${SWIM_CHUNK}`)
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        {
          float s = swimS(position.z);
          float k = swimSlope(s, ${lag.toFixed(3)});
          // Shear x by k*z rotates normals: n' = (n.x, n.y, n.z - k * n.x).
          objectNormal = normalize(vec3(objectNormal.x, objectNormal.y, objectNormal.z - k * objectNormal.x));
          #ifdef USE_TANGENT
          objectTangent = normalize(vec3(objectTangent.x, objectTangent.y, objectTangent.z - k * objectTangent.x));
          #endif
        }`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          float s = swimS(position.z);
          transformed.x += swimOffset(s, ${lag.toFixed(3)});
        }`,
      );
  };
  material.needsUpdate = true;
}

export class Fish {
  /** Add this to the scene. Position and orientation are driven by update(). */
  readonly root = new THREE.Group();
  readonly centre: THREE.Vector3;
  private readonly reducedMotion: boolean;
  private readonly cursor = new THREE.Vector2();
  private readonly heading = new THREE.Quaternion();
  private readonly uniforms: SwimUniforms;
  private bank = 0;
  private hasHeading = false;

  private constructor(model: THREE.Object3D, centre: THREE.Vector3, reducedMotion: boolean) {
    this.centre = centre.clone();
    this.reducedMotion = reducedMotion;

    const box = new THREE.Box3().setFromObject(model);
    this.uniforms = {
      uTime: { value: 0 },
      uSwim: { value: reducedMotion ? 0 : 1 },
      uNoseZ: { value: box.min.z },
      uTailZ: { value: box.max.z },
    };

    // Pivot a little ahead of the middle (near the centre of mass), so turns
    // swing the tail rather than the head.
    const pivot = box.getCenter(new THREE.Vector3());
    pivot.z = THREE.MathUtils.lerp(box.min.z, box.max.z, 0.42);
    model.position.sub(pivot).multiplyScalar(MODEL_SCALE);
    model.scale.setScalar(MODEL_SCALE);

    const patched = new Set<THREE.Material>();
    model.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.frustumCulled = false;
      const isTailFin = o.name === 'CF_FinTail';
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m.transparent) {
          // Blended fins: draw after the body, never write depth.
          m.depthWrite = false;
          o.renderOrder = 1;
        }
        if (patched.has(m)) continue;
        patched.add(m);
        patchMaterial(m, this.uniforms, isTailFin ? TAIL_FIN_LAG : 0);
      }
    });

    this.root.add(model);
    this.root.position.copy(centre);
    if (reducedMotion) {
      // Static pose: side-on, nose to the right.
      this.root.rotation.set(0, -Math.PI / 2 + 0.3, 0);
    }
  }

  static load(
    centre: THREE.Vector3,
    reducedMotion: boolean,
    onProgress?: ProgressCallback,
  ): Promise<Fish> {
    return new Promise((resolve, reject) => {
      new GLTFLoader().load(
        MODEL_URL,
        (gltf) => resolve(new Fish(gltf.scene, centre, reducedMotion)),
        (e) => {
          if (onProgress && e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total);
        },
        (err) => reject(err instanceof Error ? err : new Error(String(err))),
      );
    });
  }

  /** `pointer` is in -1..1 (x right, y up); it is damped inside. */
  update(time: number, dt: number, pointer: THREE.Vector2): void {
    this.uniforms.uTime.value = time;
    if (this.reducedMotion || dt <= 0) return;

    this.cursor.lerp(pointer, 1 - Math.exp(-dt / CURSOR_TAU));

    // Loop position and analytic velocity. The fish always moves forward
    // along the tangent, so it never has to turn on the spot.
    const w = (Math.PI * 2) / LOOP_PERIOD;
    const th = w * time;
    _pos.set(LOOP_X * Math.cos(th), LOOP_Y * Math.sin(2 * th + 0.8), LOOP_Z * Math.sin(th));
    _vel.set(-LOOP_X * w * Math.sin(th), 2 * LOOP_Y * w * Math.cos(2 * th + 0.8), LOOP_Z * w * Math.cos(th));
    const bob = BOB_AMPLITUDE * Math.sin((time / BOB_PERIOD) * Math.PI * 2);

    this.root.position.copy(this.centre).add(_pos);
    this.root.position.x += this.cursor.x * CURSOR_DRIFT.x;
    this.root.position.y += this.cursor.y * CURSOR_DRIFT.y + bob;

    // Heading: along the velocity, nose nudged toward the cursor.
    _fwd.copy(_vel);
    _fwd.y *= PITCH_FOLLOW;
    _fwd.normalize();
    _target.copy(this.root.position).addScaledVector(_fwd, 4);
    _target.x += this.cursor.x * CURSOR_LOOK.x;
    _target.y += this.cursor.y * CURSOR_LOOK.y;
    _m.lookAt(this.root.position, _target, _up);
    _q.setFromRotationMatrix(_m);

    if (!this.hasHeading) {
      this.heading.copy(_q);
      _prevFwd.copy(_fwd);
      this.hasHeading = true;
    } else {
      this.heading.slerp(_q, 1 - Math.exp(-dt / HEADING_TAU));
    }

    // Bank into turns: roll from the heading's rate of change about Y.
    const cross = _prevFwd.x * _fwd.z - _prevFwd.z * _fwd.x;
    const yawRate = Math.asin(THREE.MathUtils.clamp(cross, -1, 1)) / dt;
    const bankTarget = THREE.MathUtils.clamp(yawRate * BANK_GAIN, -BANK_MAX, BANK_MAX);
    this.bank += (bankTarget - this.bank) * (1 - Math.exp(-dt / 1.2));
    _prevFwd.copy(_fwd);

    _bankQ.setFromAxisAngle(_zAxis, this.bank);
    this.root.quaternion.copy(this.heading).multiply(_bankQ);
  }
}

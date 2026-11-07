import * as THREE from 'three';
import undulateChunk from './shaders/undulate.glsl?raw';
import finVert from './shaders/fin.vert.glsl?raw';
import finFrag from './shaders/fin.frag.glsl?raw';
import { createCircuitTexture } from './circuit';
import { COLORS, FOG_DENSITY } from './palette';

// Register the shared undulation chunk so both the ShaderMaterial fins and
// the onBeforeCompile body can `#include <undulate>`.
(THREE.ShaderChunk as unknown as Record<string, string>).undulate = undulateChunk;

export const BODY_LENGTH = 6;
const HALF = BODY_LENGTH / 2;
/** Lateral squash: koi are a little narrower than they are tall. */
const WIDTH_SCALE = 0.78;

/** Pulse period in seconds for the circuit brightness band. */
const PULSE_PERIOD = 5;

interface FinSpec {
  name: string;
  /** Root attachment point in fish-local space. */
  root: THREE.Vector3;
  /** Direction root -> tip. */
  tipDir: THREE.Vector3;
  /** Membrane normal (approximate, orthogonalised against tipDir). */
  normal: THREE.Vector3;
  length: number;
  width: number;
  opacity: number;
  rootWidth: number;
  tipWidth: number;
  spread: number;
  fork: number;
  skew: number;
  round: number;
  ripple: number;
  rippleSpeed: number;
  phase: number;
  segments: [number, number];
}

/** Body radius profile. t = 0 at the tail stalk, 1 at the nose. */
function bodyRadius(t: number): number {
  const pts: Array<[number, number]> = [
    [0.0, 0.13],
    [0.08, 0.2],
    [0.18, 0.36],
    [0.32, 0.56],
    [0.46, 0.66],
    [0.58, 0.66],
    [0.7, 0.6],
    [0.82, 0.48],
    [0.91, 0.34],
    [0.97, 0.18],
    [1.0, 0.0],
  ];
  for (let i = 1; i < pts.length; i++) {
    const [t0, r0] = pts[i - 1];
    const [t1, r1] = pts[i];
    if (t <= t1) {
      const k = (t - t0) / (t1 - t0);
      const s = k * k * (3 - 2 * k);
      return r0 + (r1 - r0) * s;
    }
  }
  return 0;
}

function buildBodyGeometry(): THREE.BufferGeometry {
  const profile: THREE.Vector2[] = [];
  const steps = 56;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Nose: ease the last few points into a rounded cap.
    const r = i === steps ? 0.001 : bodyRadius(t);
    profile.push(new THREE.Vector2(r, -HALF + t * BODY_LENGTH));
  }
  const geo = new THREE.LatheGeometry(profile, 72);
  // Lathe axis is +Y; rotate so the body runs along +X with the nose at +X.
  geo.rotateZ(-Math.PI / 2);
  geo.scale(1, 1, WIDTH_SCALE);
  geo.computeVertexNormals();
  return geo;
}

function buildFinGeometry(spec: FinSpec): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(spec.length, spec.width, spec.segments[0], spec.segments[1]);
  // PlaneGeometry: centred, in XY, normal +Z, uv.x grows with +X.
  // Shift so uv.x = 0 (root) sits at the origin.
  geo.translate(spec.length / 2, 0, 0);

  const tip = spec.tipDir.clone().normalize();
  const n = spec.normal.clone().sub(tip.clone().multiplyScalar(spec.normal.dot(tip))).normalize();
  const across = new THREE.Vector3().crossVectors(n, tip).normalize();
  const basis = new THREE.Matrix4().makeBasis(tip, across, n);
  geo.applyMatrix4(basis);
  geo.translate(spec.root.x, spec.root.y, spec.root.z);
  return geo;
}

export class Fish {
  readonly group = new THREE.Group();
  readonly body: THREE.Mesh;
  readonly bodyMaterial: THREE.MeshPhysicalMaterial;
  private readonly finMaterials: THREE.ShaderMaterial[] = [];
  private bodyUniforms: Record<string, THREE.IUniform> | null = null;
  private undulation = 1;

  constructor() {
    const circuit = createCircuitTexture();

    this.bodyMaterial = new THREE.MeshPhysicalMaterial({
      color: COLORS.fishBody,
      roughness: 0.55,
      metalness: 0.05,
      clearcoat: 0.3,
      clearcoatRoughness: 0.35,
      emissive: COLORS.accent,
      emissiveIntensity: 2.2,
      emissiveMap: circuit,
    });
    this.bodyMaterial.customProgramCacheKey = () => 'cyberfish-body';
    this.bodyMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      shader.uniforms.uUndulation = { value: this.undulation };
      shader.uniforms.uPulse = { value: -1 };
      this.bodyUniforms = shader.uniforms;

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          #include <undulate>`,
        )
        .replace(
          '#include <beginnormal_vertex>',
          `#include <beginnormal_vertex>
          {
            float s = undulateSlope(position.x);
            objectNormal = normalize(vec3(objectNormal.x - s * objectNormal.z, objectNormal.y, objectNormal.z));
          }`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          transformed.z += undulate(transformed.x);`,
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uPulse;
          // Pointy-top hex grid; returns 1 on cell edges, 0 inside.
          float hexLine(vec2 p) {
            const vec2 s = vec2(1.0, 1.7320508);
            vec4 hC = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
            vec4 h = vec4(p - hC.xy * s, p - (hC.zw + 0.5) * s);
            vec2 d = dot(h.xy, h.xy) < dot(h.zw, h.zw) ? h.xy : h.zw;
            d = abs(d);
            float e = max(dot(d, normalize(s)), d.x);
            return smoothstep(0.40, 0.5, e);
          }`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          {
            // Scales: subtle hex lines, about 6% darker. Fade out at the nose.
            // vEmissiveMapUv is the only UV varying three declares for this material.
            float scales = hexLine(vEmissiveMapUv * vec2(16.0, 27.0));
            float noseFade = smoothstep(1.0, 0.86, vEmissiveMapUv.y);
            diffuseColor.rgb *= 1.0 - 0.06 * scales * noseFade;
          }`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          {
            // Slow brightness band travelling head -> tail along the body.
            float band = exp(-pow((vEmissiveMapUv.y - uPulse) / 0.11, 2.0));
            totalEmissiveRadiance *= 0.55 + 0.9 * band;
          }`,
        );
    };

    this.body = new THREE.Mesh(buildBodyGeometry(), this.bodyMaterial);
    this.body.frustumCulled = false;
    this.group.add(this.body);

    for (const spec of this.finSpecs()) {
      const material = new THREE.ShaderMaterial({
        vertexShader: finVert,
        fragmentShader: finFrag,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: {
          uTime: { value: 0 },
          uUndulation: { value: this.undulation },
          uRipple: { value: spec.ripple },
          uRippleSpeed: { value: spec.rippleSpeed },
          uPhase: { value: spec.phase },
          uColor: { value: COLORS.fishFin.clone() },
          uGlowColor: { value: COLORS.accent.clone() },
          uOpacity: { value: spec.opacity },
          uRootWidth: { value: spec.rootWidth },
          uTipWidth: { value: spec.tipWidth },
          uSpread: { value: spec.spread },
          uFork: { value: spec.fork },
          uSkew: { value: spec.skew },
          uRound: { value: spec.round },
          uFogColor: { value: COLORS.skyHorizon.clone() },
          uFogDensity: { value: FOG_DENSITY },
        },
      });
      const mesh = new THREE.Mesh(buildFinGeometry(spec), material);
      mesh.name = spec.name;
      mesh.frustumCulled = false;
      mesh.renderOrder = spec.name === 'tail' ? 2 : 1;
      this.finMaterials.push(material);
      this.group.add(mesh);
    }

    this.addEyes();
  }

  private finSpecs(): FinSpec[] {
    const tailRootX = -HALF + 0.05;
    const pectoralX = 1.25;
    const pectoralR = bodyRadius((pectoralX + HALF) / BODY_LENGTH);
    const pelvicX = -0.1;
    const pelvicR = bodyRadius((pelvicX + HALF) / BODY_LENGTH);
    const analX = -1.5;
    const analR = bodyRadius((analX + HALF) / BODY_LENGTH);
    const dorsalX = 0.9;
    const dorsalR = bodyRadius((dorsalX + HALF) / BODY_LENGTH);

    const pectoral = (side: 1 | -1): FinSpec => ({
      name: side > 0 ? 'pectoral-r' : 'pectoral-l',
      root: new THREE.Vector3(pectoralX, -0.12, side * pectoralR * WIDTH_SCALE * 0.9),
      tipDir: new THREE.Vector3(-0.6, -0.3, side * 0.75),
      normal: new THREE.Vector3(0.15, 0.9, side * -0.35),
      length: 1.5,
      width: 0.8,
      opacity: 0.45,
      rootWidth: 0.35,
      tipWidth: 0.95,
      spread: 1.2,
      fork: 0.0,
      skew: 0.3 * side,
      round: 0.45,
      ripple: 0.14,
      rippleSpeed: 2.4,
      phase: side > 0 ? 0 : 1.7,
      segments: [20, 8],
    });

    const pelvic = (side: 1 | -1): FinSpec => ({
      name: side > 0 ? 'pelvic-r' : 'pelvic-l',
      root: new THREE.Vector3(pelvicX, -pelvicR * 0.85, side * pelvicR * WIDTH_SCALE * 0.55),
      tipDir: new THREE.Vector3(-0.55, -0.7, side * 0.45),
      normal: new THREE.Vector3(0.0, 0.5, side * 0.85),
      length: 0.75,
      width: 0.45,
      opacity: 0.4,
      rootWidth: 0.45,
      tipWidth: 0.9,
      spread: 1.1,
      fork: 0.0,
      skew: 0.25 * side,
      round: 0.45,
      ripple: 0.08,
      rippleSpeed: 2.2,
      phase: side > 0 ? 0.8 : 2.3,
      segments: [12, 6],
    });

    return [
      {
        name: 'tail',
        root: new THREE.Vector3(tailRootX, 0, 0),
        tipDir: new THREE.Vector3(-1, 0, 0),
        normal: new THREE.Vector3(0, 0, 1),
        length: BODY_LENGTH * 0.6,
        width: 2.6,
        opacity: 0.5,
        rootWidth: 0.1,
        tipWidth: 1.0,
        spread: 1.5,
        fork: 0.42,
        skew: 0.0,
        round: 0.22,
        ripple: 0.3,
        rippleSpeed: 2.0,
        phase: 0.4,
        segments: [40, 18],
      },
      {
        name: 'dorsal',
        root: new THREE.Vector3(dorsalX, dorsalR - 0.06, 0),
        tipDir: new THREE.Vector3(-0.35, 1, 0),
        normal: new THREE.Vector3(0, 0, 1),
        length: 0.95,
        width: 2.3,
        opacity: 0.38,
        rootWidth: 1.0,
        tipWidth: 0.4,
        spread: 1.0,
        fork: 0.0,
        skew: -0.5,
        round: 0.3,
        ripple: 0.07,
        rippleSpeed: 2.6,
        phase: 1.1,
        segments: [10, 24],
      },
      {
        name: 'anal',
        root: new THREE.Vector3(analX, -analR + 0.05, 0),
        tipDir: new THREE.Vector3(-0.5, -1, 0),
        normal: new THREE.Vector3(0, 0, 1),
        length: 0.7,
        width: 1.1,
        opacity: 0.38,
        rootWidth: 0.9,
        tipWidth: 0.4,
        spread: 1.0,
        fork: 0.0,
        skew: 0.4,
        round: 0.3,
        ripple: 0.07,
        rippleSpeed: 2.5,
        phase: 2.0,
        segments: [8, 14],
      },
      pectoral(1),
      pectoral(-1),
      pelvic(1),
      pelvic(-1),
    ];
  }

  private addEyes(): void {
    const eyeX = 2.35;
    const r = bodyRadius((eyeX + HALF) / BODY_LENGTH);
    const eyeGeo = new THREE.SphereGeometry(0.075, 24, 16);
    const eyeMat = new THREE.MeshPhysicalMaterial({
      color: COLORS.eye,
      roughness: 0.12,
      metalness: 0.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
    });
    for (const side of [1, -1] as const) {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(eyeX, 0.1, side * (r * WIDTH_SCALE * 0.9));
      this.group.add(eye);
    }
  }

  /** 0 freezes the body and fins (reduced motion); 1 is full movement. */
  setUndulation(v: number): void {
    this.undulation = v;
    if (this.bodyUniforms) this.bodyUniforms.uUndulation.value = v;
    for (const m of this.finMaterials) m.uniforms.uUndulation.value = v;
  }

  update(time: number): void {
    // Pulse position runs from just past the nose to beyond the tail.
    const t = (time % PULSE_PERIOD) / PULSE_PERIOD;
    const pulse = 1.25 - t * 1.6;
    if (this.bodyUniforms) {
      this.bodyUniforms.uTime.value = time;
      this.bodyUniforms.uPulse.value = pulse;
    }
    for (const m of this.finMaterials) m.uniforms.uTime.value = time;
  }
}

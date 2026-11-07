import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import grainFrag from './shaders/grain.frag.glsl?raw';

const GRAIN_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export interface PostOptions {
  mobile: boolean;
  reducedMotion: boolean;
}

/**
 * Render chain: scene -> bloom (traces and glow only) -> ACES + sRGB output
 * -> film grain and vignette in display space.
 */
export class Post {
  readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly grain: ShaderPass;
  private readonly reducedMotion: boolean;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    opts: PostOptions,
  ) {
    this.reducedMotion = opts.reducedMotion;
    const size = renderer.getSize(new THREE.Vector2());
    const pr = renderer.getPixelRatio();

    const target = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, {
      type: THREE.HalfFloatType,
      samples: opts.mobile ? 0 : 4,
    });
    this.composer = new EffectComposer(renderer, target);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(size.x, size.y);

    this.composer.addPass(new RenderPass(scene, camera));

    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(Math.max(1, size.x / 2), Math.max(1, size.y / 2)),
      0.75, // strength
      0.6, // radius
      0.75, // threshold: lit body stays below, emissive traces go above
    );
    this.composer.addPass(this.bloom);

    this.composer.addPass(new OutputPass());

    this.grain = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0 },
        uGrain: { value: 0.06 },
        uVignette: { value: 0.45 },
      },
      vertexShader: GRAIN_VERT,
      fragmentShader: grainFrag,
    });
    this.composer.addPass(this.grain);
  }

  setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
    this.bloom.setSize(Math.max(1, width / 2), Math.max(1, height / 2));
  }

  render(time: number): void {
    // Static grain under reduced motion; otherwise it flickers like film.
    if (!this.reducedMotion) this.grain.uniforms.uTime.value = time % 100;
    this.composer.render();
  }

  dispose(): void {
    this.composer.dispose();
  }
}

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Post } from './post';
import { Fish, type ProgressCallback } from './fish';
import { COLORS, FISH_KEY_DIR, FOG_DENSITY } from './palette';

/** Where the fish drifts around: upper centre of the frame, ahead of the camera. */
export const FOCUS = new THREE.Vector3(0, 2.2, -16);

export interface SceneOptions {
  reducedMotion: boolean;
  mobile: boolean;
}

/** Mouse parallax: camera offset in world units and extra rotation in radians. */
const PARALLAX_SHIFT = new THREE.Vector2(0.5, 0.25);
const PARALLAX_TILT = 0.025;

/**
 * Owns the renderer, camera, lights, post chain and the render loop.
 * Background is plain black for now; the ocean asset will fill the lower half.
 */
export class CyberScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly post: Post;
  fish: Fish | null = null;

  private readonly container: HTMLElement;
  private readonly opts: SceneOptions;
  private readonly clock = new THREE.Clock(false);
  private time = 0;
  private running = false;
  private raf = 0;
  private readonly lookTarget = new THREE.Vector3(0, FOCUS.y - 1.9, FOCUS.z);
  /** Pointer position in -1..1, and its damped copy used by the camera. */
  private readonly pointer = new THREE.Vector2();
  private readonly parallax = new THREE.Vector2();
  private resizeObserver: ResizeObserver;

  constructor(container: HTMLElement, opts: SceneOptions) {
    this.container = container;
    this.opts = opts;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(COLORS.bg, 1);
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    this.camera.position.set(0, 0, 0);
    this.camera.lookAt(this.lookTarget);

    this.scene.background = COLORS.bg.clone();
    // Fog toward the background: the fish softens slightly when it drifts away.
    this.scene.fog = new THREE.FogExp2(COLORS.bg.getHex(), FOG_DENSITY);

    // Low-level studio environment so the clearcoat picks up soft reflections.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;
    pmrem.dispose();

    // Cool key from above, a blue rim from below (the water, eventually), soft fill.
    const key = new THREE.DirectionalLight(COLORS.light, 2.4);
    key.position.copy(FISH_KEY_DIR).multiplyScalar(30).add(FOCUS);
    key.target.position.copy(FOCUS);
    this.scene.add(key, key.target);
    const rim = new THREE.DirectionalLight(COLORS.accent, 1.4);
    rim.position.set(FOCUS.x + 4, FOCUS.y - 6, FOCUS.z - 6);
    rim.target.position.copy(FOCUS);
    this.scene.add(rim, rim.target);
    const hemi = new THREE.HemisphereLight(COLORS.hemiSky, COLORS.hemiGround, 0.8);
    this.scene.add(hemi);

    this.resize();
    this.post = new Post(this.renderer, this.scene, this.camera, {
      mobile: opts.mobile,
      reducedMotion: opts.reducedMotion,
    });
    window.addEventListener('resize', this.resize);
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(container);
    document.addEventListener('visibilitychange', this.onVisibility);
    // Mouse parallax only: touch devices and reduced motion keep a still camera.
    if (!opts.mobile && !opts.reducedMotion) {
      window.addEventListener('pointermove', this.onPointerMove, { passive: true });
      window.addEventListener('pointerleave', this.onPointerLeave);
    }
  }

  /** Loads the hero fish and adds it to the scene. Progress is 0..1 of the download. */
  async loadFish(onProgress?: ProgressCallback): Promise<void> {
    const fish = await Fish.load(
      FOCUS,
      {
        reducedMotion: this.opts.reducedMotion,
        anisotropy: this.renderer.capabilities.getMaxAnisotropy(),
      },
      onProgress,
    );
    this.fish = fish;
    this.scene.add(fish.root);
    // Settle the heading before the first visible frame.
    fish.update(this.time, 1 / 60, this.pointer);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    this.clock.stop();
    cancelAnimationFrame(this.raf);
  }

  /**
   * Compile all shaders now so the first visible frame does not stutter.
   * Rendering one frame through the composer compiles the exact program
   * variants used in production (render-target path, no on-screen tone mapping).
   */
  compile(): void {
    this.update(0);
    this.render();
  }

  dispose(): void {
    this.stop();
    window.removeEventListener('resize', this.resize);
    this.resizeObserver.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerleave', this.onPointerLeave);
    this.post.dispose();
    this.renderer.dispose();
  }

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (e.pointerType !== 'mouse') return;
    this.pointer.set(
      (e.clientX / window.innerWidth) * 2 - 1,
      -((e.clientY / window.innerHeight) * 2 - 1),
    );
  };

  private readonly onPointerLeave = (): void => {
    this.pointer.set(0, 0);
  };

  private readonly resize = (): void => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Slightly wider on narrow screens so the fish stays in frame.
    this.camera.fov = w < h ? 50 : 38;
    this.camera.updateProjectionMatrix();
    this.post?.setSize(w, h);
  };

  private readonly onVisibility = (): void => {
    if (document.hidden) this.stop();
    else this.start();
  };

  private readonly frame = (): void => {
    if (!this.running) return;
    const dt = Math.min(this.clock.getDelta(), 0.1);
    if (!this.opts.reducedMotion) this.time += dt;
    this.update(dt);
    this.render();
    this.raf = requestAnimationFrame(this.frame);
  };

  protected update(dt: number): void {
    this.fish?.update(this.time, dt, this.pointer);

    // Damped mouse parallax: a small shift plus a tilt of a couple of degrees.
    const kp = 1 - Math.exp(-dt * 2.5);
    this.parallax.lerp(this.pointer, kp);
    this.camera.position.set(
      this.parallax.x * PARALLAX_SHIFT.x,
      this.parallax.y * PARALLAX_SHIFT.y,
      0,
    );
    this.camera.lookAt(this.lookTarget);
    this.camera.rotateY(-this.parallax.x * PARALLAX_TILT);
    this.camera.rotateX(this.parallax.y * PARALLAX_TILT * 0.6);
  }

  protected render(): void {
    this.post.render(this.time);
  }
}

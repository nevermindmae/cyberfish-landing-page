import * as THREE from 'three';
import { Sky } from './sky';
import { Post } from './post';
import { COLORS, FISH_KEY_DIR, FOG_DENSITY } from './palette';

export const CAMERA_HEIGHT = 1.5;
/** Where the hero asset hovers; the camera looks slightly up at this point. */
export const FOCUS = new THREE.Vector3(0, 5, -17);

export interface SceneOptions {
  reducedMotion: boolean;
  mobile: boolean;
}

/** Mouse parallax: camera offset in world units and extra rotation in radians. */
const PARALLAX_SHIFT = new THREE.Vector2(0.6, 0.3);
const PARALLAX_TILT = 0.03;

/**
 * Owns the renderer, camera, sky, lights, post chain and the render loop.
 * The ocean and fish come from Blender assets and attach to `scene`.
 */
export class CyberScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly sky: Sky;
  readonly post: Post;

  private readonly container: HTMLElement;
  private readonly opts: SceneOptions;
  private readonly clock = new THREE.Clock(false);
  private time = 0;
  private running = false;
  private raf = 0;
  private readonly lookTarget = new THREE.Vector3();
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
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(COLORS.bg, 1);
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 1200);
    this.camera.position.set(0, CAMERA_HEIGHT, 0);
    this.lookTarget.copy(FOCUS).setY(FOCUS.y - 0.6);
    this.camera.lookAt(this.lookTarget);

    this.scene.fog = new THREE.FogExp2(COLORS.skyHorizon.getHex(), FOG_DENSITY);

    this.sky = new Sky();
    this.scene.add(this.sky.mesh);

    // One cool key light plus a soft hemisphere. Lambert divides by pi, so a
    // white body at ~0.8 albedo stays just under the 0.75 bloom threshold.
    const key = new THREE.DirectionalLight(COLORS.light, 2.6);
    key.position.copy(FISH_KEY_DIR).multiplyScalar(50).add(FOCUS);
    key.target.position.copy(FOCUS);
    this.scene.add(key, key.target);
    const hemi = new THREE.HemisphereLight(COLORS.hemiSky, COLORS.hemiGround, 1.8);
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
    // Slightly wider on narrow screens so the hero stays in frame.
    this.camera.fov = w < h ? 48 : 38;
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
    // Damped mouse parallax: a small shift plus a tilt of a couple of degrees.
    const kp = 1 - Math.exp(-dt * 2.5);
    this.parallax.lerp(this.pointer, kp);
    this.camera.position.set(
      this.parallax.x * PARALLAX_SHIFT.x,
      CAMERA_HEIGHT + this.parallax.y * PARALLAX_SHIFT.y,
      0,
    );
    this.camera.lookAt(this.lookTarget);
    this.camera.rotateY(-this.parallax.x * PARALLAX_TILT);
    this.camera.rotateX(this.parallax.y * PARALLAX_TILT * 0.6);

    this.sky.follow(this.camera);
  }

  protected render(): void {
    this.post.render(this.time);
  }
}

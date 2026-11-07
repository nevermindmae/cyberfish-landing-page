import * as THREE from 'three';
import { Post } from './post';
import { Fish, type ProgressCallback } from './fish';
import { Sky } from './sky';
import { Ocean } from './ocean';
import { COLORS, FISH_KEY_DIR, OCEAN, WATER_FOG_FAR, WATER_FOG_NEAR } from './palette';

/**
 * Framing from assets-src/ocean/ocean_look.json: camera 3.2 m above the water,
 * 13 m back, pitched up 4 degrees so the horizon sits ~62% down the frame.
 * Water is the y = 0 plane; the fish hovers above the horizon line.
 */
const CAMERA_POS = new THREE.Vector3(0, 3.2, 13);
const CAMERA_PITCH_UP = THREE.MathUtils.degToRad(4);
/** Where the fish hovers: upper centre of the frame, above the horizon. */
export const FOCUS = new THREE.Vector3(0, 5.4, -1.5);

export interface SceneOptions {
  reducedMotion: boolean;
  mobile: boolean;
}

/** Mouse parallax: camera offset in world units and extra rotation in radians. */
const PARALLAX_SHIFT = new THREE.Vector2(0.5, 0.25);
const PARALLAX_TILT = 0.025;

/**
 * Owns the renderer, camera, sky, water, lights, post chain and the render loop.
 */
export class CyberScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly post: Post;
  readonly sky: Sky;
  readonly ocean: Ocean;
  fish: Fish | null = null;

  private readonly container: HTMLElement;
  private readonly opts: SceneOptions;
  private readonly clock = new THREE.Clock(false);
  private time = 0;
  private running = false;
  private raf = 0;
  /** Camera aim: straight ahead, pitched up by CAMERA_PITCH_UP. */
  private readonly lookTarget = new THREE.Vector3(
    CAMERA_POS.x,
    CAMERA_POS.y + CAMERA_POS.z * Math.tan(CAMERA_PITCH_UP),
    0,
  );
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

    this.camera = new THREE.PerspectiveCamera(32.3, 1, 0.1, 1200);
    this.camera.position.copy(CAMERA_POS);
    this.camera.lookAt(this.lookTarget);

    // Sky dome, and its prefiltered copy as the environment for reflections:
    // the water mirrors the sky, the fish shell picks up a violet sheen.
    this.sky = new Sky();
    this.sky.follow(this.camera);
    this.scene.add(this.sky.mesh);
    const skyEnv = this.sky.buildEnvironment(this.renderer);
    this.scene.environment = skyEnv;
    this.scene.environmentIntensity = 0.6;

    // Haze: linear fog toward the horizon colour. Only the water uses it (the
    // sky and fish materials have fog off), matching the Blender setup.
    this.scene.fog = new THREE.Fog(OCEAN.waterFog, WATER_FOG_NEAR, WATER_FOG_FAR);

    this.ocean = new Ocean({
      mobile: opts.mobile,
      reducedMotion: opts.reducedMotion,
      envMap: skyEnv,
    });
    this.scene.add(this.ocean.mesh);

    // Lighting: a cool-white key from the camera side, a big soft sky fill,
    // and the fish itself as the only coloured light (added with the fish).
    const key = new THREE.DirectionalLight(OCEAN.key, 1.5);
    key.position.copy(FISH_KEY_DIR).multiplyScalar(30).add(FOCUS);
    key.target.position.copy(FOCUS);
    this.scene.add(key, key.target);
    const fill = new THREE.HemisphereLight(OCEAN.fill, OCEAN.waterBase, 0.55);
    this.scene.add(fill);

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

    // The fish is the scene's only neon: two blue point lights ride with it,
    // one at the belly and one lower down toward the water (ocean_look.json).
    const glow = new THREE.PointLight(OCEAN.fishGlow, 6, 0, 2);
    glow.position.set(0, -1.4, 0);
    const glowLow = new THREE.PointLight(OCEAN.fishGlow, 10, 0, 2);
    glowLow.position.set(0, -3.6, 0);
    fish.root.add(glow, glowLow);

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
    this.ocean.dispose();
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
    // 35 mm equivalent in landscape; wider on narrow screens so the fish and
    // some water both stay in frame.
    this.camera.fov = w < h ? 52 : 32.3;
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
    this.ocean.update(this.time);
    this.sky.update(this.time);

    // Damped mouse parallax: a small shift plus a tilt of a couple of degrees.
    const kp = 1 - Math.exp(-dt * 2.5);
    this.parallax.lerp(this.pointer, kp);
    this.camera.position.set(
      CAMERA_POS.x + this.parallax.x * PARALLAX_SHIFT.x,
      CAMERA_POS.y + this.parallax.y * PARALLAX_SHIFT.y,
      CAMERA_POS.z,
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

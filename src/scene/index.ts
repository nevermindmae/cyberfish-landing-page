import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { Post } from './post';
import { Fish, type ProgressCallback } from './fish';
import { Sky } from './sky';
import { Ocean, WAVE_CREST } from './ocean';
import { COLORS, FISH_KEY_DIR, OCEAN, WATER_FOG_FAR, WATER_FOG_NEAR } from './palette';

/**
 * Framing: a long lens low over the water, pitched up a touch so the horizon
 * haze sits ~65% down the frame and the fish hangs in the sky above it.
 * Water rests at y = 0. The camera rides the swell: it stays CAMERA_CLEARANCE
 * above the local surface (smoothed), so it can sit low without the crests
 * reaching the lens, and the foreground swells fill the lower frame.
 */
const CAMERA_POS = new THREE.Vector3(0, 0, 13);
const CAMERA_CLEARANCE = 2.8;
const CAMERA_PITCH_UP = THREE.MathUtils.degToRad(4);
/** Lens: 28 degrees vertical in landscape, wider on portrait screens. */
const FOV_LANDSCAPE = 28;
const FOV_PORTRAIT = 48;
/** The fish hovers this far above the camera, so it holds its place in frame. */
const FISH_ABOVE_CAMERA = 1.2;
/**
 * Where the fish hovers (y is set per frame from the camera height). Offset
 * to one side in landscape to leave the other for the tagline; centred on
 * portrait screens where the copy sits below it.
 */
const FOCUS_OFFSET_X = 1.9;
const FOCUS = new THREE.Vector3(0, WAVE_CREST + CAMERA_CLEARANCE + FISH_ABOVE_CAMERA, -2);

export interface SceneOptions {
  reducedMotion: boolean;
  mobile: boolean;
  /** Which screen side the fish hovers on (landscape). */
  fishSide: 'left' | 'right';
  /** Which way its nose points. */
  fishFacing: 'left' | 'right';
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
  /** Camera aim: straight ahead, pitched up by CAMERA_PITCH_UP. Re-based per frame. */
  private readonly lookTarget = new THREE.Vector3();
  /** Smoothed camera height above the rest plane. */
  private cameraY = WAVE_CREST + CAMERA_CLEARANCE;
  /** Pointer position in -1..1, and its damped copy used by the camera. */
  private readonly pointer = new THREE.Vector2();
  private readonly parallax = new THREE.Vector2();
  private resizeObserver: ResizeObserver;
  /** FOCUS shifted to the configured side. */
  private readonly focus: THREE.Vector3;

  constructor(container: HTMLElement, opts: SceneOptions) {
    this.container = container;
    this.opts = opts;
    this.focus = FOCUS.clone();
    this.focus.x = opts.fishSide === 'left' ? -FOCUS_OFFSET_X : FOCUS_OFFSET_X;

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
    // LTC lookup tables for RectAreaLight (the fish's pool of light on the water).
    RectAreaLightUniformsLib.init();

    this.camera = new THREE.PerspectiveCamera(FOV_LANDSCAPE, 1, 0.1, 1200);
    this.camera.position.set(CAMERA_POS.x, this.cameraY, CAMERA_POS.z);
    this.aimCamera();

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
    key.position.copy(FISH_KEY_DIR).multiplyScalar(30).add(this.focus);
    key.target.position.copy(this.focus);
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
      this.focus,
      {
        reducedMotion: this.opts.reducedMotion,
        anisotropy: this.renderer.capabilities.getMaxAnisotropy(),
        facing: this.opts.fishFacing,
      },
      onProgress,
    );
    this.fish = fish;
    this.scene.add(fish.root);

    // The fish is the scene's only neon: two blue point lights ride with it,
    // one at the belly and one lower down toward the water (ocean_look.json).
    // A small point light at the belly lights the fish itself from below; a
    // wide area light under it throws a broad, diffuse glow onto the water
    // (a point source there would read as one hard hot spot).
    const glow = new THREE.PointLight(OCEAN.fishGlow, 3, 0, 2);
    glow.position.set(0, -1.0, 0);
    const pool = new THREE.RectAreaLight(OCEAN.fishGlow, 5, 10, 6);
    pool.position.set(0, -1.6, 0);
    pool.rotation.x = -Math.PI / 2; // emit along -Y
    fish.root.add(glow, pool);

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
    // Long lens in landscape; wider on narrow screens so the fish and some
    // water both stay in frame.
    this.camera.fov = w < h ? FOV_PORTRAIT : FOV_LANDSCAPE;
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
    this.ocean.update(this.time);
    this.sky.update(this.time);

    // Ride the swell: ease the camera height toward clearance above the
    // local surface. Slow enough to feel like a hull, quick enough that the
    // big swell never reaches the lens.
    const surface = this.ocean.heightAt(CAMERA_POS.x, CAMERA_POS.z);
    const targetY = Math.max(surface, 0) * 0.85 + CAMERA_CLEARANCE;
    const ky = this.opts.reducedMotion ? 1 : 1 - Math.exp(-dt / 1.6);
    this.cameraY += (targetY - this.cameraY) * ky;

    if (this.fish) {
      this.fish.centre.x = this.camera.aspect < 1 ? 0 : this.focus.x;
      this.fish.centre.y = this.cameraY + FISH_ABOVE_CAMERA;
      this.fish.update(this.time, dt, this.pointer);
    }

    // Damped mouse parallax: a small shift plus a tilt of a couple of degrees.
    const kp = 1 - Math.exp(-dt * 2.5);
    this.parallax.lerp(this.pointer, kp);
    this.camera.position.set(
      CAMERA_POS.x + this.parallax.x * PARALLAX_SHIFT.x,
      this.cameraY + this.parallax.y * PARALLAX_SHIFT.y,
      CAMERA_POS.z,
    );
    this.aimCamera();
    this.camera.rotateY(-this.parallax.x * PARALLAX_TILT);
    this.camera.rotateX(this.parallax.y * PARALLAX_TILT * 0.6);
    this.sky.follow(this.camera);
  }

  /** Look straight ahead from the current height, pitched up by CAMERA_PITCH_UP. */
  private aimCamera(): void {
    this.lookTarget.set(
      CAMERA_POS.x,
      this.camera.position.y + CAMERA_POS.z * Math.tan(CAMERA_PITCH_UP),
      0,
    );
    this.camera.lookAt(this.lookTarget);
  }

  protected render(): void {
    this.post.render(this.time);
  }
}

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
 * The dive ("Deploy The Decoy?"): the sea churns, the fish dips its nose and
 * shoots into the water ahead, and the camera, still looking out to sea,
 * sinks slowly straight down through the surface until the frame goes to
 * black. Times in seconds from the click.
 */
/** Hard stop; normally the fade completes first (its timing follows the swell). */
const DIVE_DURATION = 6;
/** Churn ramps up over this window. */
const DIVE_CHURN = [0.1, 1.6] as const;
/** Where the fish goes in, relative to the camera's rest position (x is
 * scaled by the fish's side). Far enough out to land in the lower frame of
 * the long, slightly up-tilted hero lens. */
const DIVE_HOLE = new THREE.Vector3(1.6, 0, 26);
/** The fish's run from hover to the hole (ease-in). */
const DIVE_FISH = [0.3, 1.6] as const;
/** The camera sinks (smooth, slow) over this window, to this far below the
 * rest plane. */
const DIVE_SINK = [1.2, 4.6] as const;
const DIVE_DEPTH = 4;
/** Fade to black after the lens goes under. */
const DIVE_DARK_AFTER = 0.2;
const DIVE_DARK_LENGTH = 0.8;
/** Reduced motion: no camera move, just the fade. */
const DIVE_DURATION_STILL = 1.4;

const easeInQuad = (t: number): number => t * t;
const window01 = (t: number, [a, b]: readonly [number, number]): number =>
  THREE.MathUtils.clamp((t - a) / (b - a), 0, 1);

interface DiveState {
  /** Seconds since the click. */
  t: number;
  /** Camera position when the dive began. */
  camStart: THREE.Vector3;
  /** Fish position when the dive began, and its path's control point. */
  fishStart: THREE.Vector3;
  fishCtrl: THREE.Vector3;
  /** World point where the fish goes in. */
  hole: THREE.Vector3;
  /** When the fish / the lens went under, or -1. */
  fishSplashAt: number;
  lensSplashAt: number;
  resolve: () => void;
}

function quadBezier(
  a: THREE.Vector3,
  c: THREE.Vector3,
  b: THREE.Vector3,
  t: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const u = 1 - t;
  return out
    .copy(a)
    .multiplyScalar(u * u)
    .addScaledVector(c, 2 * u * t)
    .addScaledVector(b, t * t);
}

function quadBezierTangent(
  a: THREE.Vector3,
  c: THREE.Vector3,
  b: THREE.Vector3,
  t: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  // d/dt = 2(1-t)(c-a) + 2t(b-c)
  return out
    .subVectors(c, a)
    .multiplyScalar(2 * (1 - t))
    .addScaledVector(_tan.subVectors(b, c), 2 * t);
}

const _tan = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

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
  private diving: DiveState | null = null;
  /** The fish's blue lights and their rest intensities (dimmed during the dive). */
  private fishLights: Array<{ light: THREE.Light; intensity: number }> = [];
  /** Dev: slow the dive down (1 = real time) to inspect the transition. */
  diveTimeScale = 1;

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
    // The belly light sits well below the fish and is cut off before the
    // water: far enough that it washes the underside evenly instead of
    // glaring off the metal in one spot, and never adding to the pool.
    const glow = new THREE.PointLight(OCEAN.fishGlow, 0.9, 3.2, 2);
    glow.position.set(0, -1.9, 0);
    const pool = new THREE.RectAreaLight(OCEAN.fishGlow, 5, 10, 6);
    pool.position.set(0, -1.6, 0);
    pool.rotation.x = -Math.PI / 2; // emit along -Y
    fish.root.add(glow, pool);
    this.fishLights = [
      { light: glow, intensity: glow.intensity },
      { light: pool, intensity: pool.intensity },
    ];

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
   * Take the camera down through the water. Resolves once the frame is fully
   * black (the caller then covers the canvas and may stop the loop).
   */
  dive(): Promise<void> {
    if (this.diving) return Promise.resolve();
    return new Promise((resolve) => {
      const side = this.focus.x < 0 ? -1 : 1;
      const hole = new THREE.Vector3(
        CAMERA_POS.x + DIVE_HOLE.x * side,
        0,
        CAMERA_POS.z - DIVE_HOLE.z,
      );
      hole.y = this.ocean.heightAt(hole.x, hole.z);
      const fishStart = this.fish ? this.fish.root.position.clone() : hole.clone();
      // Arc: a little lift and a swing toward the camera before the run in.
      const fishCtrl = fishStart.clone().lerp(hole, 0.45);
      fishCtrl.y = fishStart.y + 0.8;
      fishCtrl.z += 1.5;
      this.diving = {
        t: 0,
        camStart: this.camera.position.clone(),
        fishStart,
        fishCtrl,
        hole,
        fishSplashAt: -1,
        lensSplashAt: -1,
        resolve,
      };
    });
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
    // The whole scene slows together when the dive is being inspected.
    const dt = Math.min(this.clock.getDelta(), 0.1) * (this.diving ? this.diveTimeScale : 1);
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

    if (this.diving) this.updateDive(this.diving, dt);
    this.sky.follow(this.camera);
  }

  /** Overrides the camera and drives the water / post effects during the dive. */
  private updateDive(d: DiveState, dt: number): void {
    d.t += dt;
    const t = d.t;

    if (this.opts.reducedMotion) {
      // No camera motion: the picture just sinks into the dark.
      const k = THREE.MathUtils.clamp(t / DIVE_DURATION_STILL, 0, 1);
      this.post.setDive({ time: t, wobble: 0, flash: 0, deep: k, dark: k * k });
      if (t >= DIVE_DURATION_STILL) this.finishDive(d);
      return;
    }

    const churn = THREE.MathUtils.smoothstep(window01(t, DIVE_CHURN), 0, 1);
    this.ocean.churn = churn;
    // Ruffle the fine bump too so the churn reads at distance.
    this.ocean.material.normalScale.setScalar(0.06 + churn * 0.25);

    // 1. The fish runs in along a quadratic arc and goes under.
    const run = easeInQuad(window01(t, DIVE_FISH));
    if (this.fish && d.fishSplashAt < 0) {
      if (run > 0) {
        const pos = quadBezier(d.fishStart, d.fishCtrl, d.hole, run, _v1);
        const dir = quadBezierTangent(d.fishStart, d.fishCtrl, d.hole, run, _v2);
        this.fish.steer(pos, dir);
        // Its lights would blow out the water as it closes in.
        for (const { light, intensity } of this.fishLights) {
          light.intensity = intensity * (1 - run * 0.8);
        }
      }
      if (run >= 1) {
        d.fishSplashAt = t;
        this.fish.root.visible = false;
        this.ocean.splash(d.hole.x, d.hole.z, 1);
      }
    }

    // The hole glows blue: hard on impact, then the decoy's light dies away
    // beneath the surface while the rings carry it outward.
    let glow = 0;
    if (d.fishSplashAt >= 0) {
      const since = t - d.fishSplashAt;
      glow = 0.25 + 0.75 * Math.exp(-since * 1.6);
    }
    this.ocean.glow = glow;

    // 2. The camera sinks straight down, still looking out to sea. No
    // rotation: the water simply rises up the frame and closes over.
    const sink = THREE.MathUtils.smoothstep(window01(t, DIVE_SINK), 0, 1);
    const cam = this.camera.position;
    cam.x = d.camStart.x;
    cam.z = d.camStart.z;
    cam.y = THREE.MathUtils.lerp(d.camStart.y, -DIVE_DEPTH, sink);

    // 3. The lens goes under: a second splash, and the haze becomes deep
    // water so the underside of the surface reads dark.
    const surface = this.ocean.heightAt(cam.x, cam.z);
    if (d.lensSplashAt < 0 && sink > 0 && cam.y < surface) {
      d.lensSplashAt = t;
      this.ocean.splash(cam.x, cam.z, 0.7);
      const fog = this.scene.fog as THREE.Fog;
      fog.color.set('#020509');
      fog.near = 0.5;
      fog.far = 14;
      this.renderer.setClearColor('#020509', 1);
      // No sky down here: the dome's lower half would show below the plane.
      this.sky.mesh.visible = false;
    }

    // Lens effects: a little spray as the fish hits, wobble as the water
    // nears the lens, then the deep tint and the fade. No flash.
    const near = THREE.MathUtils.clamp((surface + 2.0 - cam.y) / 2.0, 0, 1);
    let wobble = near * 0.6;
    let deep = 0;
    let dark = 0;
    if (d.fishSplashAt >= 0) {
      const since = t - d.fishSplashAt;
      wobble = Math.max(wobble, 0.3 * Math.exp(-since * 2.5));
    }
    if (d.lensSplashAt >= 0) {
      const since = t - d.lensSplashAt;
      wobble = 1 - 0.5 * THREE.MathUtils.clamp(since / 1.2, 0, 1);
      deep = THREE.MathUtils.clamp(since / 0.15, 0, 1);
      const k = window01(since, [DIVE_DARK_AFTER, DIVE_DARK_AFTER + DIVE_DARK_LENGTH]);
      dark = THREE.MathUtils.smoothstep(k, 0, 1);
    }
    this.post.setDive({ time: t, wobble, flash: 0, deep, dark });

    if (dark >= 1 || t >= DIVE_DURATION) {
      this.post.setDive({ time: t, wobble: 0, flash: 0, deep: 1, dark: 1 });
      this.finishDive(d);
    }
  }

  private finishDive(d: DiveState): void {
    d.resolve();
    // Keep the state so update() leaves the camera where it ended.
    d.resolve = () => {};
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

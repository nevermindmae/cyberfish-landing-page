import * as THREE from 'three';
import { Ocean } from './ocean';
import { Sky } from './sky';
import { Fish } from './fish';
import { FishMotion } from './motion';
import { COLORS, FISH_KEY_DIR, FOG_DENSITY } from './palette';
import { waveHeight } from './waves';

export const CAMERA_HEIGHT = 1.5;
/** Where the fish will hover; the camera looks slightly up at this point. */
export const FISH_CENTRE = new THREE.Vector3(0, 5, -17);

export interface SceneOptions {
  reducedMotion: boolean;
  mobile: boolean;
}

/** Mouse parallax: camera offset in world units and extra rotation in radians. */
const PARALLAX_SHIFT = new THREE.Vector2(0.6, 0.3);
const PARALLAX_TILT = 0.03;

/**
 * Owns the renderer, camera, ocean, sky, fish and the render loop.
 * Post-processing attaches in a later milestone.
 */
export class CyberScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly ocean: Ocean;
  readonly sky: Sky;
  readonly fish: Fish;
  readonly motion: FishMotion;

  private readonly container: HTMLElement;
  private readonly opts: SceneOptions;
  private readonly clock = new THREE.Clock(false);
  private time = 0;
  private running = false;
  private raf = 0;
  private cameraY = CAMERA_HEIGHT;
  private readonly lookTarget = new THREE.Vector3();
  /** Pointer position in -1..1, and its damped copy used by the camera. */
  private readonly pointer = new THREE.Vector2();
  private readonly parallax = new THREE.Vector2();

  /** Current fish position, fed to the ocean glow and the fill light. */
  readonly fishPosition = FISH_CENTRE.clone();

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
    this.lookTarget.copy(FISH_CENTRE).setY(FISH_CENTRE.y - 0.6);
    this.camera.lookAt(this.lookTarget);

    // scene.fog is used by lit materials (the fish). The ocean fogs itself with
    // the same colour and density so both agree under the post-processing pass.
    this.scene.fog = new THREE.FogExp2(COLORS.skyHorizon.getHex(), FOG_DENSITY);

    this.sky = new Sky();
    this.scene.add(this.sky.mesh);

    this.ocean = new Ocean({ segments: opts.mobile ? 160 : 384 });
    this.scene.add(this.ocean.mesh);

    // One cool key light plus a soft sky/water hemisphere. Intensities are
    // kept low enough that the lit body stays under the bloom threshold.
    const key = new THREE.DirectionalLight(COLORS.light, 0.9);
    key.position.copy(FISH_KEY_DIR).multiplyScalar(50).add(FISH_CENTRE);
    key.target.position.copy(FISH_CENTRE);
    this.scene.add(key, key.target);
    const hemi = new THREE.HemisphereLight(COLORS.hemiSky, COLORS.hemiGround, 0.9);
    this.scene.add(hemi);
    // Faint fill from below so the belly is not pitch black, tinted by the water glow.
    const fill = new THREE.PointLight(COLORS.accent, 1.5, 30, 1.6);
    fill.position.set(0, -2, 0);
    this.fillLight = fill;
    this.scene.add(fill);

    this.fish = new Fish();
    this.scene.add(this.fish.group);
    this.motion = new FishMotion(this.fish, FISH_CENTRE, opts.reducedMotion);

    // Start the clock a little in so the first frame is not a flat sea.
    this.time = 12;
    this.motion.update(this.time, 0);
    this.fishPosition.copy(this.fish.group.position);

    this.resize();
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

  private resizeObserver: ResizeObserver;
  private fillLight!: THREE.PointLight;

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

  /** Compile all shaders now so the first visible frame does not stutter. */
  compile(): void {
    this.renderer.compile(this.scene, this.camera);
  }

  dispose(): void {
    this.stop();
    window.removeEventListener('resize', this.resize);
    this.resizeObserver.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerleave', this.onPointerLeave);
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
    this.camera.fov = w < h ? 48 : 38;
    this.camera.updateProjectionMatrix();
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
    this.motion.update(this.time, dt);
    this.fish.update(this.time);
    this.fishPosition.copy(this.fish.group.position);
    this.fillLight.position.set(this.fishPosition.x, this.fishPosition.y - 3, this.fishPosition.z);

    // Camera rides the swell gently: fixed height above the water beneath it.
    const h = waveHeight(0, 0, this.time);
    const targetY = CAMERA_HEIGHT + Math.max(h, -0.3) * 0.8 + 0.5;
    const k = 1 - Math.exp(-dt * 1.2);
    this.cameraY += (targetY - this.cameraY) * k;

    // Damped mouse parallax: a small shift plus a tilt of a couple of degrees.
    const kp = 1 - Math.exp(-dt * 2.5);
    this.parallax.lerp(this.pointer, kp);
    this.camera.position.set(
      this.parallax.x * PARALLAX_SHIFT.x,
      this.cameraY + this.parallax.y * PARALLAX_SHIFT.y,
      0,
    );
    // Aim between the path centre and the fish so the fish never leaves frame.
    this.lookTarget.copy(FISH_CENTRE).lerp(this.fishPosition, 0.35);
    this.lookTarget.y = FISH_CENTRE.y - 0.6;
    this.camera.lookAt(this.lookTarget);
    this.camera.rotateY(-this.parallax.x * PARALLAX_TILT);
    this.camera.rotateX(this.parallax.y * PARALLAX_TILT * 0.6);

    this.ocean.update(this.time, this.fishPosition);
    this.sky.follow(this.camera);
  }

  protected render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}

import * as THREE from 'three';
import { Ocean } from './ocean';
import { Sky } from './sky';
import { COLORS, FOG_DENSITY } from './palette';
import { waveHeight } from './waves';

export const CAMERA_HEIGHT = 1.5;
/** Where the fish will hover; the camera looks slightly up at this point. */
export const FISH_CENTRE = new THREE.Vector3(0, 5, -20);

export interface SceneOptions {
  reducedMotion: boolean;
  mobile: boolean;
}

/**
 * Owns the renderer, camera, ocean and sky, and the render loop.
 * Fish, movement and post-processing attach in later milestones.
 */
export class CyberScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly ocean: Ocean;
  readonly sky: Sky;

  private readonly container: HTMLElement;
  private readonly opts: SceneOptions;
  private readonly clock = new THREE.Clock(false);
  private time = 0;
  private running = false;
  private raf = 0;
  private cameraY = CAMERA_HEIGHT;
  private readonly lookTarget = FISH_CENTRE.clone().setY(FISH_CENTRE.y - 0.5);

  /** Current fish position, fed to the ocean glow. Replaced by the fish module later. */
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
    this.camera.lookAt(this.lookTarget);

    // scene.fog is used by lit materials (the fish). The ocean fogs itself with
    // the same colour and density so both agree under the post-processing pass.
    this.scene.fog = new THREE.FogExp2(COLORS.skyHorizon.getHex(), FOG_DENSITY);

    this.sky = new Sky();
    this.scene.add(this.sky.mesh);

    this.ocean = new Ocean({ segments: opts.mobile ? 160 : 384 });
    this.scene.add(this.ocean.mesh);

    // Start the clock a little in so the first frame is not a flat sea.
    this.time = 12;

    this.resize();
    window.addEventListener('resize', this.resize);
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(container);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  private resizeObserver: ResizeObserver;

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
    this.renderer.dispose();
  }

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
    // Camera rides the swell gently: fixed height above the water beneath it.
    const h = waveHeight(this.camera.position.x, this.camera.position.z, this.time);
    const targetY = CAMERA_HEIGHT + Math.max(h, -0.3) * 0.8 + 0.5;
    const k = 1 - Math.exp(-dt * 1.2);
    this.cameraY += (targetY - this.cameraY) * k;
    this.camera.position.y = this.cameraY;
    this.camera.lookAt(this.lookTarget);

    this.ocean.update(this.time, this.fishPosition);
    this.sky.follow(this.camera);
  }

  protected render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}

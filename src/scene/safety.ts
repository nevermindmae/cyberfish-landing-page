import * as THREE from 'three';
import type { Fish } from './fish';

/**
 * The safety chapter: copy over open water, with the hero fish swimming
 * across far behind it. The fish itself belongs to the scene (it is the
 * one from above the surface); this is its route and its light.
 */

/** How far behind the lens's rest point the fish's lane runs (small in frame). */
const LANE_DEPTH = 38;
/** The lane's height relative to the lens, and how far it wanders up/down and in/out. */
const LANE_Y = -1.2;
const WANDER_Y = 2.4;
const WANDER_Z = 5;
/** One crossing, right to left, in seconds; then it comes round again. */
const CROSSING = 24;
/** Extra lane beyond the frame's edge so the fish is clear of it when it wraps. */
const MARGIN = 5;

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _dir = new THREE.Vector3();

export class Safety {
  readonly root = new THREE.Group();
  private t0 = -1;

  constructor() {
    // The same cool key and blue rim the unit has in the deep, aimed down
    // the lane; the fish's own neon rides with it.
    const lane = new THREE.Vector3(0, LANE_Y, -LANE_DEPTH);
    const key = new THREE.DirectionalLight('#dbe8ff', 1.2);
    key.position.set(3, 8, 5).add(lane);
    key.target.position.copy(lane);
    const rim = new THREE.DirectionalLight('#2ea8ff', 2.0);
    rim.position.set(-4, 2, -8).add(lane);
    rim.target.position.copy(lane);
    const fill = new THREE.HemisphereLight('#3b5a9a', '#02050c', 0.5);
    this.root.add(key, key.target, rim, rim.target, fill);
  }

  /**
   * Swim the fish along its lane: in from the right, across behind the
   * copy, out on the left, round again. It noses along its own path, so it
   * faces left, rising and dipping and drifting nearer and further as it
   * goes.
   */
  update(time: number, camera: THREE.PerspectiveCamera, fish: Fish): void {
    if (this.t0 < 0) this.t0 = time;
    const u = ((time - this.t0) / CROSSING) % 1;
    const halfWidth =
      Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * LANE_DEPTH * camera.aspect;
    const span = halfWidth + MARGIN;
    this.point(u, span, _a);
    this.point(u + 0.004, span, _b);
    _dir.subVectors(_b, _a).normalize();
    // A little toward the lens, so we see its flank and eye, not a silhouette.
    _dir.z += 0.25;
    fish.steer(_a.add(this.root.position), _dir);
  }

  /** A point on the lane at u in 0..1 (right to left), relative to the root. */
  private point(u: number, span: number, out: THREE.Vector3): THREE.Vector3 {
    const w = Math.PI * 2 * u;
    return out.set(
      THREE.MathUtils.lerp(span, -span, u),
      LANE_Y + WANDER_Y * Math.sin(w * 1.5 + 0.6) * Math.cos(w * 0.5),
      -LANE_DEPTH + WANDER_Z * Math.sin(w + 2.1),
    );
  }

  dispose(): void {
    this.root.traverse((o) => {
      if (o instanceof THREE.Light) o.dispose();
    });
  }
}

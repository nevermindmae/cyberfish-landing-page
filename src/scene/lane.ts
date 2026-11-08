import * as THREE from 'three';
import type { Fish } from './fish';

/**
 * The hero fish's lane through an open-water chapter (safety, market,
 * team): copy over the water, with the fish swimming across far behind
 * it. The fish itself belongs to the scene (it is the one from above the
 * surface); this is its route and its light.
 */

/** How far behind the lens's rest point the fish's lane runs (small in frame). */
const LANE_DEPTH = 38;
/** The lane's height relative to the lens, and how far it wanders up/down and in/out. */
const LANE_Y = -1.2;
const WANDER_Y = 2.4;
const WANDER_Z = 3.5;
/** One crossing at cruising speed, in seconds. */
const CROSSING = 24;
/** Extra lane beyond the frame's edge so the fish is clear of it when it turns. */
const MARGIN = 5;
/** Out of frame between crossings, before it comes back the other way. */
const DWELL = 1.6;
/** How quickly it changes speed and heading (seconds). */
const SPEED_TAU = 0.9;
const HEADING_TAU = 0.7;

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _target = new THREE.Vector3();

export class FishLane {
  readonly root = new THREE.Group();

  /** Which way this crossing goes (+1 screen right, -1 screen left). */
  private dir = -1;
  /** Progress along the crossing, 0..1, and the pace it is going at (per second). */
  private u = 0;
  private speed = 0;
  /** Per-crossing wander phase, so no two passes trace the same curve. */
  private phase = 0;
  /** Seconds left out of frame between crossings, or 0 while swimming. */
  private dwell = 0;
  private readonly heading = new THREE.Vector3(-1, 0, 0.25).normalize();
  private started = false;

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
    this.plan();
  }

  /** Set up the next crossing with a fresh wander. */
  private plan(): void {
    this.u = 0;
    this.phase = Math.random() * Math.PI * 2;
  }

  /**
   * Swim the fish along its lane. It comes in from one side, crosses
   * behind the copy nosing along its own path, goes out the other side,
   * and after a moment comes back the other way. It never stops in frame.
   */
  update(dt: number, camera: THREE.PerspectiveCamera, fish: Fish): void {
    const cruise = 1 / CROSSING;
    const halfWidth =
      Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * LANE_DEPTH * camera.aspect;
    const span = halfWidth + MARGIN;

    // Where it is and where the lane leads from here.
    this.point(this.u, span, _a);
    this.point(this.u + 0.004, span, _b);
    _target.subVectors(_b, _a).normalize();
    // A little toward the lens, so we see its flank and eye, not a silhouette.
    _target.z += 0.25;

    if (!this.started) {
      this.started = true;
      this.speed = cruise;
      this.heading.copy(_target).normalize();
    }

    // Out of frame between crossings; then turn round and come back.
    if (this.dwell > 0) {
      this.dwell -= dt;
      if (this.dwell <= 0) {
        this.dwell = 0;
        this.dir = -this.dir;
        this.plan();
        this.point(this.u, span, _a);
        this.point(this.u + 0.004, span, _b);
        _target.subVectors(_b, _a).normalize();
        _target.z += 0.25;
        // Already facing the new way: the turn happened out of frame.
        this.heading.copy(_target).normalize();
      }
    } else if (this.u >= 1) {
      this.dwell = DWELL;
    }

    const wantSpeed = this.dwell > 0 ? 0 : cruise;
    this.speed += (wantSpeed - this.speed) * (1 - Math.exp(-dt / SPEED_TAU));
    this.heading.lerp(_target, 1 - Math.exp(-dt / HEADING_TAU)).normalize();
    this.u += this.speed * dt;

    fish.swim = 0.25 + 0.75 * (this.speed / cruise);
    fish.steer(_a.add(this.root.position), this.heading);
  }

  /** A point on the lane at u in 0..1, relative to the root. */
  private point(u: number, span: number, out: THREE.Vector3): THREE.Vector3 {
    const w = Math.PI * 2 * u + this.phase;
    return out.set(
      THREE.MathUtils.lerp(-span, span, u) * this.dir,
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

import * as THREE from 'three';
import type { Fish } from './fish';

/**
 * The hero fish's lane through an open-water chapter (safety, team): copy
 * over the water, with the fish swimming across far behind it. The fish
 * itself belongs to the scene (it is the one from above the surface);
 * this is its route and its light.
 */

/** A rectangle in normalised device coordinates (x right, y up, -1..1). */
export interface NdcRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

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
/**
 * The stop to look at us: how likely on a crossing, where along it (a band
 * well inside the frame), and how long it holds the look.
 */
const LOOK_CHANCE = 0.7;
const LOOK_AT = [0.3, 0.66] as const;
const LOOK_FOR = [2.2, 3.6] as const;
/** How quickly it changes speed and heading (seconds). */
const SPEED_TAU = 0.9;
const HEADING_TAU = 0.7;
/**
 * Stopping clear of the copy: how far ahead of the stop (in lane progress)
 * the fish starts easing aside, how quickly it eases (seconds), the room
 * it keeps from the copy's edge (NDC, roughly the fish's own size), and
 * how far out toward the frame's edge a stop may be.
 */
const ASIDE_LEAD = 0.07;
const ASIDE_TAU = 0.8;
const CLEARANCE = new THREE.Vector2(0.16, 0.13);
const STOP_LIMIT = new THREE.Vector2(0.82, 0.78);

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _target = new THREE.Vector3();
const _toLens = new THREE.Vector3();
const _p = new THREE.Vector3();
const _stop = new THREE.Vector3();
const _move = new THREE.Vector3();
const _ndc = new THREE.Vector2();

const between = (range: readonly [number, number]): number =>
  THREE.MathUtils.lerp(range[0], range[1], Math.random());

export class FishLane {
  readonly root = new THREE.Group();

  /** Which way this crossing goes (+1 screen right, -1 screen left). */
  private dir = -1;
  /** Progress along the crossing, 0..1, and the pace it is going at (per second). */
  private u = 0;
  private speed = 0;
  /** Per-crossing wander phase, so no two passes trace the same curve. */
  private phase = 0;
  /** The stop on this crossing, if any: where, and how long; -1 once done. */
  private lookAt = -1;
  private lookFor = 0;
  /** Seconds left in the current look or dwell, or 0 while swimming. */
  private hold = 0;
  private holding: 'look' | 'dwell' | null = null;
  private readonly heading = new THREE.Vector3(-1, 0, 0.25).normalize();
  private started = false;
  /**
   * Stepping aside for the stop: the offset from the lane to a spot clear
   * of the copy (root space), how much of it is applied (0..1), and
   * whether this crossing's stop has been worked out yet.
   */
  private readonly aside = new THREE.Vector3();
  private asideAmount = 0;
  private asideWanted = false;
  private asidePlanned = false;
  /** Where it was last frame (root space), to face the way it moves. */
  private readonly last = new THREE.Vector3();
  private hasLast = false;

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

  /** Set up the next crossing: a fresh wander, maybe a stop to look round. */
  private plan(): void {
    this.u = 0;
    this.phase = Math.random() * Math.PI * 2;
    this.lookAt = Math.random() < LOOK_CHANCE ? between(LOOK_AT) : -1;
    this.lookFor = between(LOOK_FOR);
    this.asidePlanned = false;
    this.asideWanted = false;
  }

  /**
   * Swim the fish along its lane. It comes in from one side, crosses
   * behind the copy nosing along its own path, goes out the other side,
   * and after a moment comes back the other way. Now and then, part way
   * across, it slows to a stop, turns to look at us, and then swims on.
   * When it stops it steps clear of the copy (`keepOut`, the copy's box on
   * screen), so it is seen beside the words rather than behind them.
   */
  update(dt: number, camera: THREE.PerspectiveCamera, fish: Fish, keepOut: NdcRect | null): void {
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

    // Coming up to a stop: work out where to make it, clear of the copy.
    if (this.lookAt >= 0 && !this.asidePlanned && this.u >= this.lookAt - ASIDE_LEAD) {
      this.asidePlanned = true;
      this.point(this.lookAt, span, _stop);
      if (this.chooseStop(_stop, camera, keepOut) === null) this.lookAt = -1; // nowhere clear: swim on
      else this.asideWanted = true;
    }

    // Holds: looking at us mid-lane, or out of frame between crossings.
    if (this.holding) {
      this.hold -= dt;
      if (this.hold <= 0) {
        if (this.holding === 'dwell') {
          this.dir = -this.dir;
          this.plan();
          this.point(this.u, span, _a);
          this.point(this.u + 0.004, span, _b);
          _target.subVectors(_b, _a).normalize();
          _target.z += 0.25;
          // Already facing the new way: the turn happened out of frame.
          this.heading.copy(_target).normalize();
          this.hasLast = false;
        } else {
          // Look over: drift back onto the lane as it swims on.
          this.asideWanted = false;
        }
        this.holding = null;
      }
    } else if (this.lookAt >= 0 && this.u >= this.lookAt) {
      this.holding = 'look';
      this.hold = this.lookFor;
      this.lookAt = -1;
    } else if (this.u >= 1) {
      this.holding = 'dwell';
      this.hold = DWELL;
    }

    // Looking: come to rest. Otherwise cruise along the lane.
    let wantSpeed = cruise;
    if (this.holding) wantSpeed = 0;
    this.speed += (wantSpeed - this.speed) * (1 - Math.exp(-dt / SPEED_TAU));
    this.u += this.speed * dt;

    // The step aside eases in ahead of the stop and out again after it.
    const asideTo = this.asideWanted ? 1 : 0;
    this.asideAmount += (asideTo - this.asideAmount) * (1 - Math.exp(-dt / ASIDE_TAU));
    _a.addScaledVector(this.aside, this.asideAmount);

    // Face the way it is actually going (lane plus the step aside), so a
    // veer reads as a turn; looking, bring the face round toward the lens
    // (kept three-quarter, so the body still reads).
    if (this.holding === 'look') {
      _toLens.copy(camera.position).sub(_a).sub(this.root.position).normalize();
      _target.multiplyScalar(0.35).add(_toLens).normalize();
    } else if (this.hasLast && _move.subVectors(_a, this.last).length() > 0.002) {
      _target.copy(_move).normalize();
      _target.z += 0.25;
      _target.normalize();
    }
    this.last.copy(_a);
    this.hasLast = true;
    this.heading.lerp(_target, 1 - Math.exp(-dt / HEADING_TAU)).normalize();

    fish.swim = 0.25 + 0.75 * (this.speed / cruise);
    fish.steer(_a.add(this.root.position), this.heading);
  }

  /**
   * Given where the lane would have the fish stop (root space), decide
   * whether it needs to step aside to be clear of the copy, and set
   * `aside` accordingly. True: the stop is on (with `aside` zero when the
   * lane point is already clear); null: no clear spot in frame.
   */
  private chooseStop(
    at: THREE.Vector3,
    camera: THREE.PerspectiveCamera,
    keepOut: NdcRect | null,
  ): boolean | null {
    this.aside.set(0, 0, 0);
    if (!keepOut) return true;
    // Where the stop lands on screen.
    _p.copy(at).add(this.root.position).project(camera);
    _ndc.set(_p.x, _p.y);
    const box = {
      x0: keepOut.x0 - CLEARANCE.x,
      x1: keepOut.x1 + CLEARANCE.x,
      y0: keepOut.y0 - CLEARANCE.y,
      y1: keepOut.y1 + CLEARANCE.y,
    };
    const inside = _ndc.x > box.x0 && _ndc.x < box.x1 && _ndc.y > box.y0 && _ndc.y < box.y1;
    if (!inside) return true;

    // The nearest way out: above, below, left or right of the copy, as long
    // as that is still well inside the frame.
    const options: Array<[number, number]> = [
      [_ndc.x, box.y1],
      [_ndc.x, box.y0],
      [box.x0, _ndc.y],
      [box.x1, _ndc.y],
    ];
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (const o of options) {
      if (Math.abs(o[0]) > STOP_LIMIT.x || Math.abs(o[1]) > STOP_LIMIT.y) continue;
      const d = Math.hypot(o[0] - _ndc.x, o[1] - _ndc.y);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    if (!best) return null;

    // Back into the world: the spot on the lane's depth plane that sits at
    // that point on screen.
    const zPlane = at.z + this.root.position.z;
    _p.set(best[0], best[1], 0.5).unproject(camera).sub(camera.position).normalize();
    const t = (zPlane - camera.position.z) / _p.z;
    if (!(t > 0)) return null;
    _p.multiplyScalar(t).add(camera.position).sub(this.root.position);
    this.aside.subVectors(_p, at);
    return true;
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

import * as THREE from 'three';
import type { Fish } from './fish';

/** Seconds for one full loop of the path. */
const LOOP_PERIOD = 50;
/** Half-extent of the figure-8 along X, in world units. */
const PATH_HALF_WIDTH = 4;
/** Depth stretch of the figure-8 along Z. */
const PATH_DEPTH = 1.5;
/** Vertical bob: amplitude and period. */
const BOB_AMPLITUDE = 0.3;
const BOB_PERIOD = 8;
/** Banking: radians of roll per rad/s of heading change, and the clamp. */
const BANK_GAIN = 2.6;
const BANK_MAX = 0.42;
/** Static pose parameter used under prefers-reduced-motion. */
const STATIC_THETA = 0.95;

const _p = new THREE.Vector3();
const _pa = new THREE.Vector3();
const _pb = new THREE.Vector3();
const _tangent = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

/** Lemniscate (figure-8) in the XZ plane with a gentle rise and fall. */
function pathPoint(theta: number, out: THREE.Vector3): THREE.Vector3 {
  const s = Math.sin(theta);
  const c = Math.cos(theta);
  const d = 1 + s * s;
  out.set(
    (PATH_HALF_WIDTH * c) / d,
    0.35 * Math.sin(2 * theta + 1.0),
    ((PATH_HALF_WIDTH * s * c) / d) * PATH_DEPTH,
  );
  return out;
}

function yawFromTangent(t: THREE.Vector3): number {
  // Fish-local forward is +X; rotation.y maps +X to (cos, 0, -sin).
  return Math.atan2(-t.z, t.x);
}

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/**
 * Drives the fish group along a slow closed path above the water, banking
 * into turns and bobbing gently. Everything here is deliberately slow.
 */
export class FishMotion {
  private bank = 0;
  private pitch = 0;

  constructor(
    private readonly fish: Fish,
    private readonly centre: THREE.Vector3,
    private readonly reducedMotion: boolean,
  ) {
    if (reducedMotion) {
      this.fish.setUndulation(0);
      this.pose(STATIC_THETA, 0);
    }
  }

  update(time: number, dt: number): void {
    if (this.reducedMotion) return;

    const theta = (time / LOOP_PERIOD) * Math.PI * 2;
    const bob = BOB_AMPLITUDE * Math.sin((time / BOB_PERIOD) * Math.PI * 2);
    this.pose(theta, bob, dt);
  }

  private pose(theta: number, bob: number, dt = 0): void {
    const eps = 0.01;
    pathPoint(theta, _p);
    pathPoint(theta - eps, _pa);
    pathPoint(theta + eps, _pb);
    _tangent.subVectors(_pb, _pa);

    const dThetaDt = (Math.PI * 2) / LOOP_PERIOD;
    const yaw = yawFromTangent(_tangent);

    if (dt > 0) {
      // Heading rate drives bank; both are damped so turns feel heavy and calm.
      const yawA = yawFromTangent(_pa.subVectors(_p, _pa));
      const yawB = yawFromTangent(_pb.subVectors(_pb, _p));
      const yawRate = (wrapAngle(yawB - yawA) / (2 * eps)) * dThetaDt;
      const bankTarget = THREE.MathUtils.clamp(-yawRate * BANK_GAIN, -BANK_MAX, BANK_MAX);
      const k = 1 - Math.exp(-dt / 1.4);
      this.bank += (bankTarget - this.bank) * k;

      const horizontal = Math.hypot(_tangent.x, _tangent.z);
      const pitchTarget = Math.atan2(_tangent.y, horizontal) * 0.6;
      this.pitch += (pitchTarget - this.pitch) * k;
    } else {
      this.bank = 0;
      this.pitch = 0;
    }

    const group = this.fish.group;
    group.position.copy(this.centre).add(_p);
    group.position.y += bob;
    _euler.set(this.bank, yaw, this.pitch, 'YXZ');
    group.quaternion.setFromEuler(_euler);
  }
}

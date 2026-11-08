import * as THREE from 'three';

/**
 * The safety chapter: copy over open water, with the hero fish hanging in
 * the empty lower right behind it. The fish itself belongs to the scene
 * (it is the one from above the surface); this is its place and its light.
 */

/**
 * Where the fish hovers, relative to the chapter's root (the lens's rest
 * point, looking down -Z): lower right, a little further off than the
 * unit in the deep so it sits behind the copy without crowding it.
 * Centred on narrow screens, where the right third is off the frame.
 */
export const SAFETY_FISH_POS = new THREE.Vector3(3.4, -2.3, -18);
export const SAFETY_FISH_POS_PORTRAIT = new THREE.Vector3(0, -3.2, -18);

export class Safety {
  readonly root = new THREE.Group();

  constructor() {
    // The same cool key and blue rim the unit has in the deep, aimed where
    // the fish hangs; its own neon rides with it.
    const key = new THREE.DirectionalLight('#dbe8ff', 1.2);
    key.position.set(3, 8, 5).add(SAFETY_FISH_POS);
    key.target.position.copy(SAFETY_FISH_POS);
    const rim = new THREE.DirectionalLight('#2ea8ff', 2.0);
    rim.position.set(-4, 2, -8).add(SAFETY_FISH_POS);
    rim.target.position.copy(SAFETY_FISH_POS);
    const fill = new THREE.HemisphereLight('#3b5a9a', '#02050c', 0.5);
    this.root.add(key, key.target, rim, rim.target, fill);
  }

  /** Where the fish should hover, in world units. */
  fishCentre(aspect: number, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(aspect < 1 ? SAFETY_FISH_POS_PORTRAIT : SAFETY_FISH_POS).add(this.root.position);
  }

  dispose(): void {
    this.root.traverse((o) => {
      if (o instanceof THREE.Light) o.dispose();
    });
  }
}

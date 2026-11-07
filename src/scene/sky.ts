import * as THREE from 'three';
import vertexShader from './shaders/sky.vert.glsl?raw';
import fragmentShader from './shaders/sky.frag.glsl?raw';
import { COLORS } from './palette';

export class Sky {
  readonly mesh: THREE.Mesh;

  constructor(radius = 600) {
    const geometry = new THREE.SphereGeometry(radius, 32, 16);
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTopColor: { value: COLORS.skyTop.clone() },
        uHorizonColor: { value: COLORS.skyHorizon.clone() },
      },
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
  }

  /** Keep the sphere centred on the camera so the gradient never shifts. */
  follow(camera: THREE.Camera): void {
    this.mesh.position.copy(camera.position);
  }
}

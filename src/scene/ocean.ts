import * as THREE from 'three';
import vertexShader from './shaders/ocean.vert.glsl?raw';
import fragmentShader from './shaders/ocean.frag.glsl?raw';
import { NUM_WAVES, waveUniforms } from './waves';
import { COLORS, FOG_DENSITY, LIGHT_DIR } from './palette';

export interface OceanOptions {
  size?: number;
  segments?: number;
}

export class Ocean {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;

  constructor({ size = 400, segments = 256 }: OceanOptions = {}) {
    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    const waves = waveUniforms();

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      defines: { NUM_WAVES },
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uWaveA: { value: waves.a },
        uWaveB: { value: waves.b },
        uBaseColor: { value: COLORS.waterBase.clone() },
        uCrestColor: { value: COLORS.waterCrest.clone() },
        uSheenColor: { value: COLORS.waterSheen.clone() },
        uLightDir: { value: LIGHT_DIR.clone() },
        uLightColor: { value: COLORS.light.clone() },
        uFishPos: { value: new THREE.Vector3(0, 5, -20) },
        uGlowColor: { value: COLORS.accent.clone() },
        uGlowStrength: { value: 0.16 },
        uGlowRadius: { value: 5.5 },
        uFogColor: { value: COLORS.skyHorizon.clone() },
        uFogDensity: { value: FOG_DENSITY },
      },
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    // Shift the plane forward so most of it lies in front of the camera.
    this.mesh.position.set(0, 0, -60);
  }

  update(time: number, fishPos: THREE.Vector3): void {
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uFishPos.value.copy(fishPos);
  }
}

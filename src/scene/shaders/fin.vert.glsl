// Fin / tail vertex shader. The plane is baked into fish-local space with
// uv.x running root -> tip. A travelling sine ripples the membrane along its
// normal, strongest at the tip, and the whole fin follows the body undulation.

#include <undulate>

uniform float uRipple;
uniform float uRippleSpeed;
uniform float uPhase;

varying vec2 vUv;
varying float vViewDepth;

void main() {
  vUv = uv;
  vec3 p = position;

  float along = uv.x;
  float across = uv.y - 0.5;
  float wave = sin(along * 6.5 - uTime * uRippleSpeed + across * 1.8 + uPhase);
  float wave2 = sin(along * 11.0 - uTime * uRippleSpeed * 1.6 + uPhase * 2.0);
  float amp = uRipple * uUndulation * (along * along) * (0.8 + 0.2 * wave2);
  p += normal * wave * amp;

  p.z += undulate(p.x);

  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  vViewDepth = -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;
}

// The fish as particles. Positions come from the CPU simulation (rest
// shape plus whatever the cursor has stirred up); this adds a faint
// shimmer so the cloud never sits perfectly still, and sizes the sprites.

attribute vec3 aSeed;   // x: random, y: size, z: twinkle phase

uniform float uTime;
uniform float uPixelRatio;

varying float vSeed;
varying float vTwinkle;

void main() {
  vec3 p = position;
  float t = uTime * 1.1 + aSeed.z * 6.2831;
  p += vec3(sin(t), cos(t * 0.8 + 1.3), sin(t * 0.6 + 2.1)) * 0.012;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float depth = max(-mv.z, 0.1);
  gl_PointSize = min(aSeed.y * uPixelRatio * 30.0 / depth, 14.0 * uPixelRatio);

  vSeed = aSeed.x;
  vTwinkle = 0.75 + 0.25 * sin(uTime * 2.3 + aSeed.z * 6.2831);
}

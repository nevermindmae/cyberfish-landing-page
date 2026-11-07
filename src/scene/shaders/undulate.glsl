// Shared body undulation. Fish-local space: +X is forward (head), -X is tail.
// A lateral (Z) sine wave travels toward the tail at about 0.8 Hz, with
// amplitude growing from head to tail. uUndulation is 0 under reduced motion.

uniform float uTime;
uniform float uUndulation;

float undulateAmp(float x) {
  return 0.035 + 0.24 * smoothstep(2.2, -3.2, x);
}

float undulate(float x) {
  return undulateAmp(x) * uUndulation * sin(x * 1.05 + uTime * 5.03);
}

// d(undulate)/dx, for correcting normals after the shear.
float undulateSlope(float x) {
  return undulateAmp(x) * uUndulation * 1.05 * cos(x * 1.05 + uTime * 5.03);
}

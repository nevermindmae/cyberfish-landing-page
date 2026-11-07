// Ocean vertex shader. Layered Gerstner waves, normals by finite differences.
// NUM_WAVES is injected via material.defines.

uniform float uTime;
uniform vec4 uWaveA[NUM_WAVES]; // dir.x, dir.y, amplitude, k (2*pi / wavelength)
uniform vec2 uWaveB[NUM_WAVES]; // omega (2*pi / period), steepness

varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vHeight;
varying float vViewDepth;

vec3 displace(vec2 p, float t) {
  vec3 d = vec3(0.0);
  for (int i = 0; i < NUM_WAVES; i++) {
    vec2 dir = uWaveA[i].xy;
    float a = uWaveA[i].z;
    float k = uWaveA[i].w;
    float w = uWaveB[i].x;
    float q = uWaveB[i].y;
    float phi = k * dot(dir, p) - w * t;
    d.xz += q * a * dir * cos(phi);
    d.y += a * sin(phi);
  }
  return d;
}

void main() {
  vec3 base = (modelMatrix * vec4(position, 1.0)).xyz;
  vec2 p = base.xz;

  float e = 0.4;
  vec3 d = displace(p, uTime);
  vec3 dx = displace(p + vec2(e, 0.0), uTime);
  vec3 dz = displace(p + vec2(0.0, e), uTime);

  vec3 P = base + d;
  vec3 Px = base + vec3(e, 0.0, 0.0) + dx;
  vec3 Pz = base + vec3(0.0, 0.0, e) + dz;

  vNormal = normalize(cross(Pz - P, Px - P));
  vWorldPos = P;
  vHeight = d.y;

  vec4 mvPosition = viewMatrix * vec4(P, 1.0);
  vViewDepth = -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;
}

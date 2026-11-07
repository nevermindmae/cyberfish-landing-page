// Sky: vertical gradient, horizon colour melting into the top colour.
// No stars, no moon. Horizon colour matches the fog so the join is seamless.

uniform vec3 uTopColor;
uniform vec3 uHorizonColor;

varying vec3 vWorldPos;

void main() {
  vec3 d = normalize(vWorldPos - cameraPosition);
  float t = clamp(d.y, 0.0, 1.0);
  // Keep a wide haze band near the horizon, then ease to the dark top.
  t = pow(t, 0.6);
  vec3 col = mix(uHorizonColor, uTopColor, t);
  gl_FragColor = vec4(col, 1.0);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}

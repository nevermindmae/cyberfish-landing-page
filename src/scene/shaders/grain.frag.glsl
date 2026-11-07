// Film grain and vignette. Runs after OutputPass, so it operates in display
// space and the grain amount is a direct fraction of the final pixel value.

uniform sampler2D tDiffuse;
uniform float uTime;
uniform float uGrain;
uniform float uVignette;

varying vec2 vUv;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec4 c = texture2D(tDiffuse, vUv);

  float g = hash(gl_FragCoord.xy + vec2(uTime * 37.0, uTime * 11.0)) - 0.5;
  c.rgb += g * uGrain;

  vec2 d = (vUv - 0.5) * vec2(1.0, 0.85);
  float v = 1.0 - smoothstep(0.3, 0.95, length(d) * 1.35) * uVignette;
  c.rgb *= v;

  gl_FragColor = c;
}

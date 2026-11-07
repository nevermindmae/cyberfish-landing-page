// Film grain and vignette, plus the dive transition. Runs after OutputPass,
// so it operates in display space and the grain amount is a direct fraction
// of the final pixel value.

uniform sampler2D tDiffuse;
uniform float uTime;
uniform float uGrain;
uniform float uVignette;
// Dive transition.
uniform float uDiveTime;  // seconds since the dive began
uniform float uWobble;    // refraction wobble strength (0 = off)
uniform float uFlash;     // impact flash
uniform float uDeep;      // 0..1 deep-water tint
uniform float uDark;      // 0..1 fade to black

varying vec2 vUv;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 uv = vUv;

  // Water on the lens: a slow large ripple plus fine rings that race outward.
  if (uWobble > 0.0) {
    vec2 c = uv - 0.5;
    float r = length(c);
    float rings = sin(r * 48.0 - uDiveTime * 26.0) * exp(-r * 1.5);
    float sway = sin(uv.y * 9.0 + uDiveTime * 5.0) * cos(uv.x * 7.0 - uDiveTime * 3.7);
    vec2 offset = normalize(c + 1e-4) * rings * 0.9 + vec2(sway, -sway * 0.6) * 0.6;
    uv += offset * uWobble * 0.02;
    // Slight chromatic split as well.
    float split = uWobble * 0.004;
    vec4 cr = texture2D(tDiffuse, uv + c * split);
    vec4 cb = texture2D(tDiffuse, uv - c * split);
    vec4 cg = texture2D(tDiffuse, uv);
    vec4 c0 = vec4(cr.r, cg.g, cb.b, 1.0);
    gl_FragColor = c0;
  } else {
    gl_FragColor = texture2D(tDiffuse, uv);
  }
  vec4 col = gl_FragColor;

  float g = hash(gl_FragCoord.xy + vec2(uTime * 37.0, uTime * 11.0)) - 0.5;
  col.rgb += g * uGrain;

  vec2 d = (uv - 0.5) * vec2(1.0, 0.85);
  float v = 1.0 - smoothstep(0.3, 0.95, length(d) * 1.35) * uVignette;
  col.rgb *= v;

  // Under the surface: everything sinks toward a deep blue-black, the
  // edges first; the impact itself is a cold flash.
  vec3 deep = vec3(0.01, 0.03, 0.07);
  float lum = dot(col.rgb, vec3(0.299, 0.587, 0.114));
  col.rgb = mix(col.rgb, deep + lum * vec3(0.05, 0.18, 0.35), uDeep);
  col.rgb += uFlash * vec3(0.55, 0.78, 1.0);
  col.rgb *= 1.0 - uDark;

  gl_FragColor = vec4(col.rgb, 1.0);
}

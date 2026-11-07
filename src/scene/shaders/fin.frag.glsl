// Fin / tail fragment shader. The silhouette is cut from the plane in UV
// space; translucent membrane with faint rays and a blue edge glow.

uniform vec3 uColor;
uniform vec3 uGlowColor;
uniform float uOpacity;
uniform float uRootWidth;  // half-width at the root, in uv.y units (0..1)
uniform float uTipWidth;   // half-width at the tip
uniform float uSpread;     // exponent shaping how width grows root -> tip
uniform float uFork;       // 0 = straight end, >0 = forked end depth
uniform float uSkew;       // shear of the centre line toward -y with length
uniform float uRound;      // radius of the rounded end cap, in uv.x units
uniform vec3 uFogColor;
uniform float uFogDensity;

varying vec2 vUv;
varying float vViewDepth;

void main() {
  float x = clamp(vUv.x, 0.0, 1.0);
  float yy = (vUv.y - 0.5) * 2.0 + uSkew * x;

  float w = mix(uRootWidth, uTipWidth, pow(x, uSpread));
  float ny = abs(yy) / max(w, 1e-3);          // 0 at centre line, 1 at edge
  float xEnd = 1.0 - uFork * pow(1.0 - clamp(ny, 0.0, 1.0), 1.6);

  // Silhouette distance: lateral until the end cap, then an elliptical cap so
  // tips and fork lobes come out rounded.
  float capStart = xEnd - uRound;
  float d = x <= capStart ? ny : length(vec2((x - capStart) / max(uRound, 1e-3), ny));
  float aa = fwidth(d) * 1.5;
  float inside = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, d);
  inside *= smoothstep(0.0, 0.03, x);

  if (inside <= 0.001) discard;

  float edgeDist = (1.0 - d) * w * 0.5;

  // Fin rays: subtle streaks fanning root -> tip.
  float rays = 0.9 + 0.1 * sin(yy * 28.0 + x * 4.0);
  // Membrane thins toward the tip and edges.
  float body = (0.65 + 0.35 * (1.0 - x)) * (0.75 + 0.25 * (1.0 - ny));

  float edgeGlow = smoothstep(0.09, 0.0, edgeDist);

  vec3 col = uColor * rays * body;
  col += uGlowColor * edgeGlow * 0.55;

  float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * vViewDepth * vViewDepth);
  col = mix(col, uFogColor, clamp(fogFactor, 0.0, 1.0));

  float alpha = uOpacity * inside * (0.8 + 0.2 * (1.0 - x)) + edgeGlow * 0.2 * inside;
  gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}

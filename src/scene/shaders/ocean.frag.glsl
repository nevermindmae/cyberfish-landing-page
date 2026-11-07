// Ocean fragment shader. Dark navy base, crest lift from the normal, one cool
// specular, blue glow on the water under the fish, exponential fog.
//
// Fog is computed here with linear uniforms rather than three's fog chunk:
// when rendering straight to the canvas three supplies fogColor in the output
// colour space, which makes dark fog colours far too bright before tone mapping.

uniform vec3 uBaseColor;
uniform vec3 uCrestColor;
uniform vec3 uSheenColor;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform vec3 uFishPos;
uniform vec3 uGlowColor;
uniform float uGlowStrength;
uniform float uGlowRadius;
uniform vec3 uFogColor;
uniform float uFogDensity;

varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vHeight;
varying float vViewDepth;

void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(cameraPosition - vWorldPos);
  vec3 l = normalize(uLightDir);

  // Aerial perspective on detail: shading contrast fades with distance so the
  // far water settles to the base colour, which is close to the horizon token.
  float dist = distance(cameraPosition, vWorldPos);
  float detail = exp(-dist * 0.03);

  // Crest shading: higher and more tilted water catches more light.
  float lift = smoothstep(-1.2, 2.6, vHeight);
  float slope = 1.0 - clamp(n.y, 0.0, 1.0);
  float crest = clamp(lift * 0.7 + slope * 2.0, 0.0, 1.0) * detail;
  vec3 col = mix(uBaseColor, uCrestColor, crest);

  // Soft wrap diffuse from the single cool light.
  float diff = clamp(dot(n, l) * 0.5 + 0.5, 0.0, 1.0);
  col *= mix(1.0, 0.7 + 0.8 * diff, detail);

  // Grazing angles pick up a cool silvery sheen, fading with distance.
  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 2.5);
  col = mix(col, uSheenColor, fres * 0.65 * detail);

  // One tight specular lobe, plus a wider soft sheen. Kept off the very
  // nearest water, where the grid is coarse and the lobe would smear.
  vec3 h = normalize(l + v);
  float ndh = clamp(dot(n, h), 0.0, 1.0);
  float spec = pow(ndh, 200.0) * 0.3 + pow(ndh, 24.0) * 0.03;
  col += uLightColor * spec * mix(0.3, 1.0, detail) * smoothstep(4.0, 14.0, dist);

  // Glow on the water directly under the fish, falling off with distance.
  vec2 dxz = vWorldPos.xz - uFishPos.xz;
  float d2 = dot(dxz, dxz);
  float glow = exp(-d2 / (uGlowRadius * uGlowRadius));
  // Facets tilted toward the fish catch a little more.
  vec3 toFish = normalize(uFishPos - vWorldPos);
  float facing = clamp(dot(n, toFish), 0.0, 1.0);
  col += uGlowColor * glow * uGlowStrength * (0.5 + 0.5 * facing);

  // Exponential-squared fog toward the horizon colour.
  float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * vViewDepth * vViewDepth);
  col = mix(col, uFogColor, clamp(fogFactor, 0.0, 1.0));

  gl_FragColor = vec4(col, 1.0);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}

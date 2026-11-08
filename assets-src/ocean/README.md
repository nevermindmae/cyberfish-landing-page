# Ocean hero scene

Blender source for the landing-page hero: dark blue/violet night sea, big slow swells,
the CyberFish hovering above the water and acting as the only neon light source.
Palette rule for this scene: **blues and purples only** — no green, yellow, orange or red anywhere
(sky, water, haze, lights, bloom). Keep every light colour cool-white or blue.

## Files

- `ocean_scene.blend` — scene `Ocean` (the `CyberFish` scene from the asset build is in the same file)
- `build_ocean.py` — rebuilds the whole `Ocean` scene from scratch (everything it owns is prefixed `OC_`)
- `render_ocean_hero.png` — 1920×1080 EEVEE render, bloom applied
- `ocean_tile.glb` — one frame of the swell surface (static mesh, for a reference / fallback)
- `ocean_look.json` — the exact colours, camera and wave parameters used, in linear RGB, for the three.js port

## How the look is built (so it can be matched in three.js)

| Element | Blender | three.js equivalent |
| --- | --- | --- |
| Sky | gradient on view-direction Z: horizon band → indigo → violet zenith, plus soft stretched-noise cirrus (`CLOUDS`) that fades toward the zenith (see `ocean_look.json`) | a big inverted sphere with a vertex-Y gradient shader + a low-octave noise cloud layer, or `scene.background` texture |
| Grain | compositor overlay of a generated noise image (`GRAIN`, stills only) | animated film-grain shader pass |
| Water | Principled: base `(0.012,0.020,0.090)`, roughness 0.06, coat 0.6, IOR 1.33 + small noise bump | `MeshPhysicalMaterial` with `clearcoat`, low roughness, dark navy color, env map = the sky |
| Haze | inside the water shader: mix toward the horizon colour by camera distance 25 → 220 m | `scene.fog = new THREE.Fog(horizonColor, 25, 220)` applied to the water only |
| Swells | Ocean modifier: scale 3.0, choppiness 1.4, wind 32, alignment 0.7, 160 m tile ×3 | Gerstner / FFT waves in a vertex shader; amplitude ≈ 2.5 m, dominant wavelength ≈ 60–90 m |
| Fish glow | shell emissive ×18, two blue point lights (320 W + 150 W) just in front of / below the fish | `PointLight(0x4d9eff)` at the belly and under the tail + bloom |
| Bloom | compositor Glare (Bloom) threshold 0.9, strength 0.45 | `UnrealBloomPass(res, 0.45, 0.6, 0.9)` |
| Camera | 35 mm, at (0, −13, 3.2), pitched up 4°, f/2.0 DoF focused on the fish | `PerspectiveCamera(32°)`, horizon ≈ 62 % down the frame |

Gotchas found while building:
- Any non-zero **world volume** makes EEVEE render the sky black (volume occludes to infinity). Keep `HAZE = 0` and do haze in the water shader.
- Blender 5 compositor: the Glare type is a menu *socket* (`node.inputs["Type"].default_value = 'Bloom'`), and the Mix node's colour result is `outputs[2]`.
- Blender 5 actions are slotted: `action.fcurves` is gone — walk `layers → strips → channelbags`.

## Regenerate

In Blender, with `ocean_scene.blend` (or any file that contains the `CF_*` fish objects) open:

```python
exec(open("build_ocean.py").read())
```

Knobs: `FISH_Z` (hover height), `FISH_SCALE`, `WAVE_SCALE`; frame range 1–240 animates the swell (ocean `time` 0 → 12 s).

## Drop-in values for `src/scene/palette.ts` (sRGB hex, three converts to linear)

| token | hex | from |
| --- | --- | --- |
| `skyTop` | `#382973` | zenith (violet) |
| `skyMid` | `#423886` | upper sky |
| `skyLow` | `#5552a2` | just above the horizon band |
| `skyHorizon` | `#848bcb` | horizon band |
| `skyCloudTint` | `#8b7cce` | cirrus tint, mix ≈ 0.55 × noise |
| `waterBase` | `#1d2755` | water albedo (roughness 0.06, clearcoat 0.6) |
| `waterFog` | `#525f9b` | water-only fog, 25 → 220 m, max 0.92 |
| `fishGlow` | `#95ceff` | the two point lights at the fish (320 W / 150 W equiv.) |
| `fill` | `#bcc4f9` | big soft overhead fill |

The existing `FOG_DENSITY = 0.02` (exp²) is much denser than the Blender haze; linear `Fog(waterFog, 25, 220)` on the water material matches the render.

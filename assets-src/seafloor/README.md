# Seafloor backdrop (floor chapter)

Blender source for the seabed behind the CyberFish mark in the last chapter: dark rolling dunes with soft
drapery folds, faceted rocks framing the left and right, one shaft of light from the upper right and a
blue glow in the water behind. **No particles or logo**: the mark cloud is built in three.js (`src/scene/floor.ts`).
Palette rule as for the ocean scene: blues only, every light cool-white or blue.

## Files

- `seafloor.blend`: scene `Seafloor` (everything prefixed `SF_`)
- `build_seafloor.py`: rebuilds the whole scene from scratch. Knobs: `RES` (terrain grid, default 280), `SEED` (rock shapes)
- `render_seafloor.py`: CLI render helper (Cycles / Metal)
- `export_seafloor_glb.py`: decimated glTF export of terrain + rocks
- `render_seafloor.png`: 1920×1080 Cycles render, 160 spp, denoised
- `seafloor.glb`: terrain + 26 rocks, ~28k verts, 1.15 MB (also copied to `public/models/seafloor.glb`)

## Coordinates (matches `floor.ts`)

The camera rests at the origin, so the GLB drops straight into `Floor.root` with no offset.
glTF is Y-up: three `(x, y, z)` = Blender `(x, z, -y)`.

| What | three.js (floor root space) | `floor.ts` constant |
| --- | --- | --- |
| Camera | `(0, 0, 0)`, vertical FOV 28°, aims at `(0, -0.9, -10)` | `LOOK_OFFSET`, `FOV_LANDSCAPE` |
| Mean sand level | `y = -5.2` (dunes ≈ −6.3 … +2.9) | `FLOOR_Y` |
| Mark | `(0, -0.3, -11)` (`SF_MarkAnchor` empty in the .blend) | `MARK_POS` |
| Light pool on the sand | xz `(9, -21)`, radius ≈ 6.5 | `POOL` |
| Terrain extent | x −60…60, z +6…−114 | |

The sand directly below and behind the mark is kept low and free of rocks, so the mark stays the subject.

## Loading it

```ts
const gltf = await new GLTFLoader().loadAsync('/models/seafloor.glb');
floor.root.add(gltf.scene); // already in floor-root space
```

The exported materials are flat PBR colours only (`SF_Sand`, `SF_Rock`). The ripple bump, the caustics and the
water haze are procedural in Blender. In three.js the existing `floor.frag.glsl` (caustics, pool, distance fade) can be
put on the terrain mesh in place of the plane's `PlaneGeometry`: drop the vertex shader's dune displacement, since the mesh
already carries the height. Rocks want the same distance fade so they melt into the water instead of popping.

## Look values (linear RGB)

| | value |
| --- | --- |
| Sand albedo | `(0.018, 0.032, 0.080)`, roughness 0.88, blue sheen 0.55 |
| Rock albedo | `(0.028, 0.038, 0.062)` ± noise, sand settled on up-facing tops |
| Caustics | `#9fd2ff`-ish, warped Voronoi edges inside the pool, very faint |
| Water | volume density 0.008, scatter `(0.25, 0.48, 1.0)`, anisotropy 0.7 |
| World | `#02050c` × (2, 2.5, 3) |
| Shaft | spot from `(12, 27, 40)` (Blender) onto the pool, 13°, soft blend |
| Back glow | point light deep behind on the right (Blender `(26, 85, 12)`), lights the water |

Gotcha: an **area light** inside a volume leaves a hard straight edge in the haze along its plane (nothing is lit behind
it). The back glow is a point light for that reason.

## Regenerate

Build in the running Blender (via the MCP or the Text editor), then render/export from the CLI. Rendering through
the MCP stalls Blender, so don't.

```python
exec(open("build_seafloor.py").read())
```

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b seafloor.blend -P render_seafloor.py -- "$PWD/render_seafloor.png" 100 160
/Applications/Blender.app/Contents/MacOS/Blender -b seafloor.blend -P export_seafloor_glb.py -- "$PWD/seafloor.glb"
```

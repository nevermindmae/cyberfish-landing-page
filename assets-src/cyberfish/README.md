# CyberFish asset source

Generated procedurally in Blender 5.2 (no hand modelling). The shipped models live in
`public/models/`:

- `cyberfish_posed.glb`  – hero S-curve pose with body roll (use for the static hero shot)
- `cyberfish_straight.glb` – same fish, straight along +Y, nose at +Y, tail fin tip near Y≈0
  (use this one if you animate a swim in a vertex shader / bones)

Both: ~9 MB, ~116k tris, PBR textures embedded (baseColor, ORM, normal, emissive), glTF
extensions used: KHR_materials_clearcoat, KHR_materials_emissive_strength, alpha BLEND on fins.
Load with three.js `GLTFLoader`; add `UnrealBloomPass` (threshold ~1.0, strength ~0.2) so the
circuit traces and eye rings glow. `viewer.html` is a minimal reference setup.

## Regenerating

Open `cyberfish.blend` (or an empty scene) in Blender and run, in order, from the Python console:

```python
exec(open("build_fish.py").read())                                   # geometry, pose, camera, lights
OUT_DIR = "textures"; exec(open("gen_textures.py").read())          # numpy PBR maps
exec(open("apply_materials.py").read())                              # wire textures into materials
```

Set `POSE = False` before `build_fish.py` for the straight version. Knobs: body profiles `H`/`Wd`/`ZC`,
`SPINE_PTS` and `TILT_TAIL` (pose), fin ray definitions, and in `gen_textures.py` the scale grid,
head seam positions and the circuit router (`CELL`, trace counts, belly mask).
Export: File ▸ Export ▸ glTF 2.0, select the `CF_*` meshes, "Apply Modifiers" on, +Y up.

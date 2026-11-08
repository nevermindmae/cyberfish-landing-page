# DeKoi product renders

Blender source for the DeKoi hardware shots: the black Kjell Raspberry Pi 4 case (P88179) with the
backlit CyberFish mark on the lid, and a Raspberry Pi 4 Model B with a pin-fin heatsink inside.
Units are centimetres (1 BU = 1 cm). Everything the build owns is prefixed `DK_`.

## Files

- `dekoi.blend`: scene `DeKoi`
- `build_dekoi.py`: rebuilds the whole scene from scratch (case, lid, mark, Pi, stage, lights, cameras, animation)
- `render_dekoi.py`: command-line render helper
- `export_dekoi_glb.py`: exports the web model to `public/models/dekoi.glb`
- `viewer.html`: minimal three.js check page with an open/close button
- `render_dekoi_closed.png`, `render_dekoi_open.png`, `render_dekoi_detail.png`: 1920×1080 Cycles stills, 256 spp

## Web model: `public/models/dekoi.glb`

- ~2.5 MB, ~53k tris, no textures. Extensions: KHR_materials_clearcoat, KHR_materials_emissive_strength.
- Real size in metres (9.4 × 3.0 × 6.4 cm), Y up, the case's bottom sits at y = 0.
- Hierarchy: `DeKoi` (scale 0.01) → `DK_CaseBody`, `DK_Standoffs`, `DK_LidRig` (lid + frame line + mark), `DK_Pi4` (board and parts).
  Move or rotate `DK_LidRig` to open the case yourself, or play the `DK_LidOpen` clip (4 s, closed until 0.8 s) with an `AnimationMixer`.
- Glow: the mark is emissive ×14, the frame line ×2.2, the Pi's power LED ×60. Bloom threshold around 1.0 picks them up.
- The PCB's trace pattern is procedural in Blender and exports as flat green.
- Check it: run `python3 -m http.server 8765` from the repo root, then open `http://localhost:8765/assets-src/dekoi/viewer.html`.

## Shots

| Shot | Camera | Frame |
| --- | --- | --- |
| Closed hero | `DK_Cam` | 1 |
| Lid floating, Pi revealed | `DK_Cam` | 120 |
| Close-up of the Pi | `DK_CamDetail` | 120 |

The lid hangs off the `DK_LidRig` empty: closed until frame 24, lifts and tilts toward the camera by
frame 84, then drifts (30 fps). `DK_Cam` tracks `DK_CamTarget` and moves from the hero angle to the open angle.

## Look

- Mark geometry comes straight from `public/cyberfish-mark.svg`, laid along the lid's long axis, emissive ×14.
- Inset frame line on the lid is emissive ×2.2, matching the lit outline on the real unit.
- Lights: soft cool key + top, `#2EA8FF` blue rim and a cool rim (both with narrow spread), a blue wash on the backdrop.
- Stage colour is near `--bg`; AgX Medium High Contrast; compositor bloom threshold 1.2, strength 0.35.

## Regenerate and render

In Blender: `exec(open("/abs/path/assets-src/dekoi/build_dekoi.py").read())`, then save.

Render from the command line, not from a live Blender session (the first Metal kernel compile can stall the UI for a long time):

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b dekoi.blend -P render_dekoi.py -- "$PWD" 100 256 1:render_dekoi_closed 120:render_dekoi_open 120:render_dekoi_detail@DK_CamDetail
```

Export the web model after any rebuild: `exec(open("/abs/path/assets-src/dekoi/export_dekoi_glb.py").read())` inside Blender.

# Background render helper:  Blender -b dekoi.blend -P render_dekoi.py -- <out_dir> <pct> <samples> <frames...|anim>
import bpy, sys
argv = sys.argv[sys.argv.index("--") + 1:]
out, pct, spp, frames = argv[0], int(argv[1]), int(argv[2]), argv[3:]
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'METAL'; prefs.get_devices()
for d in prefs.devices: d.use = True
sc = bpy.data.scenes["DeKoi"]
sc.render.engine = 'CYCLES'; sc.cycles.device = 'GPU'
sc.render.resolution_percentage = pct; sc.cycles.samples = spp
if frames == ["anim"]:
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 1280, 720, 100
    sc.camera = bpy.data.objects["DK_Cam"]
    sc.render.filepath = out.rstrip("/") + "/frame_"
    bpy.ops.render.render(animation=True, scene=sc.name)
else:
    for f in frames:
        f, _, name = f.partition(":")
        name, _, cam = name.partition("@")                      # e.g. 120:detail@DK_CamDetail
        sc.camera = bpy.data.objects[cam] if cam else bpy.data.objects["DK_Cam"]
        sc.frame_set(int(f)); sc.render.filepath = out.rstrip("/") + "/" + (name or f"frame_{int(f):04d}") + ".png"
        bpy.ops.render.render(write_still=True, scene=sc.name)

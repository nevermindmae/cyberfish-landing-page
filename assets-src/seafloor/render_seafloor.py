# Background render helper:  Blender -b seafloor.blend -P render_seafloor.py -- <out.png> <pct> <samples>
import bpy, sys
argv = sys.argv[sys.argv.index("--") + 1:]
out, pct, spp = argv[0], int(argv[1]), int(argv[2])
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'METAL'; prefs.get_devices()
for d in prefs.devices: d.use = True
sc = bpy.data.scenes["Seafloor"]
sc.render.engine = 'CYCLES'; sc.cycles.device = 'GPU'
sc.render.resolution_percentage = pct; sc.cycles.samples = spp
sc.render.filepath = out
bpy.ops.render.render(write_still=True, scene=sc.name)

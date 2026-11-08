# Export the seabed + rocks for three.js:
#   Blender -b seafloor.blend -P export_seafloor_glb.py -- <out.glb>
# Decimates on the way out (the .blend keeps full detail). glTF is Y-up, so the
# camera rest point is the origin and mean sand sits at y = -5.2: add the scene
# straight to Floor.root. Materials export as flat PBR colours only; the ripples,
# caustics and haze are procedural in Blender and belong in the three.js shaders.
import bpy, sys
out = sys.argv[sys.argv.index("--") + 1:][0]
sc = bpy.data.scenes["Seafloor"]
for o in sc.objects:
    o.select_set(False)
keep = [o for o in sc.objects if o.name == "SF_Terrain" or o.name.startswith("SF_Rock_")]
for o in keep:
    m = o.modifiers.new("SF_ExportDecimate", 'DECIMATE')
    m.ratio = 0.28 if o.name == "SF_Terrain" else 0.35
    o.select_set(True)
assert bpy.context.scene == sc, "open the .blend with the Seafloor scene active"
bpy.context.view_layer.objects.active = keep[0]
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True,
                          export_apply=True, export_yup=True, export_cameras=False,
                          export_lights=False, export_texcoords=True, export_normals=True)

# Export the DeKoi model (case + lid + Pi, no stage/lights/cameras) to public/models/dekoi.glb.
# glTF is in metres: everything is temporarily parented under a 0.01-scaled root (the scene is modelled in cm).
# Run inside Blender after build_dekoi.py:  exec(open("/abs/path/export_dekoi_glb.py").read())
import bpy, os
sc = bpy.data.scenes["DeKoi"]
for w in bpy.context.window_manager.windows: w.scene = sc
OUT = os.path.join(os.path.dirname(bpy.data.filepath), "..", "..", "public", "models", "dekoi.glb")
OUT = os.path.normpath(OUT)
sc.frame_set(1)                                                  # lid closed

keep = [o for c in ("DK_Case", "DK_Pi") for o in bpy.data.collections[c].all_objects]
temp = []
# text -> mesh (glTF has no text)
for o in list(keep):
    if o.type == 'FONT':
        me = bpy.data.meshes.new_from_object(o.evaluated_get(bpy.context.evaluated_depsgraph_get()))
        mo = bpy.data.objects.new(o.name + "_mesh", me); bpy.data.collections["DK_Pi"].objects.link(mo)
        mo.parent = o.parent; mo.matrix_basis = o.matrix_basis.copy()
        keep.remove(o); keep.append(mo); temp.append(mo)
# PCB: procedural trace pattern doesn't survive glTF; export a flat solder-mask green
pcb = bpy.data.materials["DK_PCB"]; nt = pcb.node_tree
bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
saved_links = [(l.from_socket, l.to_socket) for l in nt.links if l.to_node == bsdf and l.to_socket.name == "Base Color"]
for l in [l for l in nt.links if l.to_node == bsdf and l.to_socket.name == "Base Color"]: nt.links.remove(l)
bsdf.inputs["Base Color"].default_value = (0.015, 0.14, 0.045, 1)

root = bpy.data.objects.new("DeKoi", None); sc.collection.objects.link(root); root.scale = (0.01, 0.01, 0.01)
tops = [o for o in keep if o.parent is None]
for o in tops: o.parent = root
lid_action = bpy.data.objects["DK_LidRig"].animation_data.action
lid_action.name = "DK_LidOpen"

try:
    bpy.ops.object.select_all(action='DESELECT')
    for o in keep + [root]: o.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_apply=True,
                              export_yup=True, export_cameras=False, export_lights=False,
                              export_animations=True, export_frame_range=True, export_force_sampling=True)
finally:
    for o in tops: o.parent = None
    bpy.data.objects.remove(root)
    for o in temp:
        me = o.data; bpy.data.objects.remove(o)
        if me.users == 0: bpy.data.meshes.remove(me)
    for fs, ts in saved_links: nt.links.new(fs, ts)
    sc.frame_set(1)

result = {"out": OUT, "bytes": os.path.getsize(OUT)}

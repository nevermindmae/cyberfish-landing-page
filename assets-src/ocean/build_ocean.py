"""Ocean hero scene for the CyberFish landing page — run inside Blender via the MCP.

Creates (or rebuilds) a scene named "Ocean" in the open .blend:
  * big slow swells from Blender's Ocean modifier, dark satin water material
  * a flat far-sea plane so the horizon never shows an edge
  * gradient sky (lighter band at the horizon) + thin volumetric haze
  * the CyberFish (CF_* objects already in the file) hovering above the water,
    rotated upright, with a blue point light inside it so its glow reaches the water
  * camera with shallow depth of field, EEVEE + bloom compositor

Everything this script owns is prefixed OC_ so it can be re-run safely.
Globals that may be injected before exec: FISH_Z (hover height), FISH_SCALE, WAVE_SCALE, HAZE.
"""
import bpy, math
from mathutils import Vector

FISH_Z = globals().get("FISH_Z", 1.3)
FISH_SCALE = globals().get("FISH_SCALE", 0.70)
WAVE_SCALE = globals().get("WAVE_SCALE", 3.0)
CLOUDS = globals().get("CLOUDS", 0.55)        # 0 = clean gradient, 1 = heavy cirrus
GRAIN = globals().get("GRAIN", 0.16)          # film grain strength in the compositor (stills only)
HAZE = globals().get("HAZE", 0.0)         # world volume density. NOTE: any non-zero world volume makes EEVEE render the sky black (occluded to infinity) — haze lives in the water shader instead

# ------------------------------------------------------------------ scene
sc = bpy.data.scenes.get("Ocean")
if sc is None:
    sc = bpy.data.scenes.new("Ocean")
bpy.context.window.scene = sc
for o in list(sc.objects):
    if o.name.startswith("OC_"):
        bpy.data.objects.remove(o, do_unlink=True)
for blk in (bpy.data.meshes, bpy.data.lights, bpy.data.cameras):
    for d in list(blk):
        if d.name.startswith("OC_") and d.users == 0: blk.remove(d)
root = sc.collection
def coll(name):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
    if c.name not in root.children: root.children.link(c)
    return c
c_env, c_fish, c_light = coll("OC_Env"), coll("OC_Fish"), coll("OC_Lights")
def link(ob, c):
    if ob.name not in c.objects: c.objects.link(ob)

# ------------------------------------------------------------------ water material
def water_material():
    mat = bpy.data.materials.get("OC_Water") or bpy.data.materials.new("OC_Water")
    mat.use_nodes = True
    nt = mat.node_tree; nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial"); out.location = (500, 0)
    b = nt.nodes.new("ShaderNodeBsdfPrincipled"); b.location = (150, 0)
    b.inputs["Base Color"].default_value = (0.012, 0.020, 0.090, 1)
    b.inputs["Roughness"].default_value = 0.06
    b.inputs["IOR"].default_value = 1.33
    b.inputs["Specular IOR Level"].default_value = 0.6
    b.inputs["Coat Weight"].default_value = 0.6; b.inputs["Coat Roughness"].default_value = 0.03
    # small ripples on top of the big swells
    tc = nt.nodes.new("ShaderNodeTexCoord"); tc.location = (-800, -300)
    mp = nt.nodes.new("ShaderNodeMapping"); mp.location = (-620, -300); mp.inputs["Scale"].default_value = (0.9, 1.3, 1.0)
    nz = nt.nodes.new("ShaderNodeTexNoise"); nz.location = (-440, -300)
    nz.inputs["Scale"].default_value = 3.0; nz.inputs["Detail"].default_value = 6.0; nz.inputs["Roughness"].default_value = 0.55
    bump = nt.nodes.new("ShaderNodeBump"); bump.location = (-200, -300); bump.inputs["Strength"].default_value = 0.06; bump.inputs["Distance"].default_value = 0.4
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"]); nt.links.new(mp.outputs["Vector"], nz.inputs["Vector"])
    nt.links.new(nz.outputs["Fac"], bump.inputs["Height"]); nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    # distance haze: fade the water toward the horizon colour with camera distance
    cam = nt.nodes.new("ShaderNodeCameraData"); cam.location = (-200, 300)
    rng = nt.nodes.new("ShaderNodeMapRange"); rng.location = (0, 300); rng.interpolation_type = 'SMOOTHSTEP'
    rng.inputs["From Min"].default_value = 25.0; rng.inputs["From Max"].default_value = 220.0
    rng.inputs["To Min"].default_value = 0.0; rng.inputs["To Max"].default_value = 0.92
    haze = nt.nodes.new("ShaderNodeEmission"); haze.location = (150, 200)
    haze.inputs["Color"].default_value = (0.085, 0.115, 0.330, 1)   # a step darker than the sky band: horizon stays readable; haze.inputs["Strength"].default_value = 1.0
    mixs = nt.nodes.new("ShaderNodeMixShader"); mixs.location = (350, 0)
    nt.links.new(cam.outputs["View Distance"], rng.inputs["Value"]); nt.links.new(rng.outputs["Result"], mixs.inputs["Fac"])
    nt.links.new(b.outputs[0], mixs.inputs[1]); nt.links.new(haze.outputs[0], mixs.inputs[2])
    nt.links.new(mixs.outputs[0], out.inputs[0])
    return mat
water = water_material()

# ------------------------------------------------------------------ ocean
me = bpy.data.meshes.new("OC_Ocean")
me.from_pydata([(-1, -1, 0), (1, -1, 0), (1, 1, 0), (-1, 1, 0)], [], [(0, 1, 2, 3)])
ocean = bpy.data.objects.new("OC_Ocean", me); link(ocean, c_env)
om = ocean.modifiers.new("Ocean", 'OCEAN')
om.geometry_mode = 'GENERATE'
om.resolution = 18; om.viewport_resolution = 10
om.spatial_size = 160; om.size = 1.0
om.repeat_x = 3; om.repeat_y = 3
om.wave_scale = WAVE_SCALE; om.wave_scale_min = 0.0
om.choppiness = 1.4; om.wind_velocity = 32.0; om.wave_alignment = 0.7; om.wave_direction = math.radians(35)
om.depth = 200; om.damping = 0.4; om.use_foam = False; om.random_seed = 7
om.time = 6.0
ocean.location = (0, 0, 0)
# animate the swell (24 fps, 10 s loop-ish)
sc.frame_start, sc.frame_end = 1, 240
om.time = 0.0; om.keyframe_insert("time", frame=1)
om.time = 12.0; om.keyframe_insert("time", frame=240)
def _all_fcurves(action):
    if hasattr(action, "fcurves"):
        return list(action.fcurves)
    out = []
    for layer in action.layers:                 # Blender 4.4+/5 slotted actions
        for strip in layer.strips:
            for cb in strip.channelbags: out.extend(cb.fcurves)
    return out
for fc in _all_fcurves(ocean.animation_data.action):
    for kp in fc.keyframe_points: kp.interpolation = 'LINEAR'
for p in me.polygons: p.use_smooth = True
ocean.data.materials.append(water)
ocean.modifiers.new("Smooth", 'SUBSURF').levels = 0   # placeholder keeps shading smooth after Ocean generate
ocean.modifiers["Smooth"].render_levels = 0

# far sea: huge flat disc below trough level so the horizon is continuous
far = bpy.data.meshes.new("OC_FarSea")
N = 64; verts = [(0, 0, 0)] + [(6000 * math.cos(2 * math.pi * i / N), 6000 * math.sin(2 * math.pi * i / N), 0) for i in range(N)]
faces = [(0, 1 + i, 1 + (i + 1) % N) for i in range(N)]
far.from_pydata(verts, [], faces)
farsea = bpy.data.objects.new("OC_FarSea", far); link(farsea, c_env)
farsea.location = (0, 0, -1.2)
farsea.data.materials.append(water)
for p in far.polygons: p.use_smooth = True

# ------------------------------------------------------------------ sky + haze
world = bpy.data.worlds.get("OC_World") or bpy.data.worlds.new("OC_World")
world.use_nodes = True
sc.world = world
nt = world.node_tree; nt.nodes.clear()
out = nt.nodes.new("ShaderNodeOutputWorld"); out.location = (600, 0)
bg = nt.nodes.new("ShaderNodeBackground"); bg.location = (350, 0); bg.inputs["Strength"].default_value = 1.0
tc = nt.nodes.new("ShaderNodeTexCoord"); tc.location = (-700, 0)
sep = nt.nodes.new("ShaderNodeSeparateXYZ"); sep.location = (-500, 0)
mr = nt.nodes.new("ShaderNodeMapRange"); mr.location = (-300, 0)
mr.inputs["From Min"].default_value = -0.01; mr.inputs["From Max"].default_value = 0.30
ramp = nt.nodes.new("ShaderNodeValToRGB"); ramp.location = (-50, 0)
ramp.color_ramp.interpolation = 'EASE'
e = ramp.color_ramp.elements
e[0].position = 0.0; e[0].color = (0.230, 0.260, 0.600, 1)   # horizon band — lighter, lavender-blue
e[1].position = 1.0; e[1].color = (0.040, 0.022, 0.170, 1)   # zenith (violet)
mid = ramp.color_ramp.elements.new(0.06); mid.color = (0.090, 0.085, 0.360, 1)
mid2 = ramp.color_ramp.elements.new(0.40); mid2.color = (0.055, 0.040, 0.240, 1)
nt.links.new(tc.outputs["Generated"], sep.inputs[0]); nt.links.new(sep.outputs["Z"], mr.inputs["Value"])
nt.links.new(mr.outputs["Result"], ramp.inputs["Fac"])
# soft cloud texture: two noise octaves on the view direction, stretched horizontally like high cirrus
cmap = nt.nodes.new("ShaderNodeMapping"); cmap.location = (-500, -300); cmap.inputs["Scale"].default_value = (1.0, 1.0, 3.2)
nz1 = nt.nodes.new("ShaderNodeTexNoise"); nz1.location = (-300, -300)
nz1.inputs["Scale"].default_value = 2.2; nz1.inputs["Detail"].default_value = 6.0; nz1.inputs["Roughness"].default_value = 0.62; nz1.inputs["Lacunarity"].default_value = 2.4
cramp = nt.nodes.new("ShaderNodeValToRGB"); cramp.location = (-100, -300)
ce = cramp.color_ramp.elements; ce[0].position = 0.38; ce[0].color = (0, 0, 0, 1); ce[1].position = 0.72; ce[1].color = (1, 1, 1, 1)
# clouds fade out toward the zenith and are strongest just above the horizon band
cfade = nt.nodes.new("ShaderNodeMapRange"); cfade.location = (-100, -550)
cfade.inputs["From Min"].default_value = 0.02; cfade.inputs["From Max"].default_value = 0.55; cfade.inputs["To Min"].default_value = 1.0; cfade.inputs["To Max"].default_value = 0.15
cmul = nt.nodes.new("ShaderNodeMath"); cmul.location = (100, -400); cmul.operation = 'MULTIPLY'
cloud_col = nt.nodes.new("ShaderNodeMixRGB"); cloud_col.location = (150, 0); cloud_col.blend_type = 'MIX'
cloud_col.inputs["Color2"].default_value = (0.26, 0.20, 0.62, 1)     # cloud tint: lavender
cstr = nt.nodes.new("ShaderNodeMath"); cstr.location = (250, -400); cstr.operation = 'MULTIPLY'; cstr.inputs[1].default_value = CLOUDS
nt.links.new(tc.outputs["Generated"], cmap.inputs["Vector"]); nt.links.new(cmap.outputs["Vector"], nz1.inputs["Vector"])
nt.links.new(nz1.outputs["Fac"], cramp.inputs["Fac"])
nt.links.new(sep.outputs["Z"], cfade.inputs["Value"])
nt.links.new(cramp.outputs["Color"], cmul.inputs[0]); nt.links.new(cfade.outputs["Result"], cmul.inputs[1])
nt.links.new(cmul.outputs[0], cstr.inputs[0]); nt.links.new(cstr.outputs[0], cloud_col.inputs["Fac"])
nt.links.new(ramp.outputs["Color"], cloud_col.inputs["Color1"])
nt.links.new(cloud_col.outputs["Color"], bg.inputs["Color"])
nt.links.new(bg.outputs[0], out.inputs["Surface"])
if HAZE > 0:
    vol = nt.nodes.new("ShaderNodeVolumeScatter"); vol.location = (350, -250)
    vol.inputs["Color"].default_value = (0.50, 0.55, 1.0, 1); vol.inputs["Density"].default_value = HAZE
    vol.inputs["Anisotropy"].default_value = 0.35
    nt.links.new(vol.outputs[0], out.inputs["Volume"])

# ------------------------------------------------------------------ fish
rig = bpy.data.objects.new("OC_FishRig", None); link(rig, c_fish)
rig.empty_display_type = 'PLAIN_AXES'
rig.location = (0, 0, FISH_Z)
rig.rotation_euler = (math.radians(90), 0, math.radians(180))   # nose up (+Z); belly (circuits) faces the camera at -Y
rig.scale = (FISH_SCALE,) * 3
fish_objs = [o for o in bpy.data.objects if o.name.startswith("CF_") and o.type == 'MESH']
for o in fish_objs:
    link(o, c_fish)
    o.parent = rig
    o.matrix_parent_inverse.identity()
# make the fish read as the light source: stronger emission in the dark scene
for mname, strength in (("CF_Shell", 18.0), ("CF_FinMat", 0.4), ("CF_TailMat", 0.4), ("CF_Glow", 25.0)):
    m = bpy.data.materials.get(mname)
    if m and m.node_tree:
        for n in m.node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED': n.inputs["Emission Strength"].default_value = strength

# ------------------------------------------------------------------ lights
def point(name, loc, energy, color, radius):
    ld = bpy.data.lights.new(name, 'POINT'); ld.energy = energy; ld.color = color; ld.shadow_soft_size = radius
    lo = bpy.data.objects.new(name, ld); link(lo, c_light); lo.location = loc; return lo
def sun(name, rot, energy, color, angle=2.0):
    ld = bpy.data.lights.new(name, 'SUN'); ld.energy = energy; ld.color = color; ld.angle = math.radians(angle)
    lo = bpy.data.objects.new(name, ld); link(lo, c_light); lo.rotation_euler = rot; return lo
def area(name, loc, target, energy, size, color):
    ld = bpy.data.lights.new(name, 'AREA'); ld.energy = energy; ld.size = size; ld.color = color
    lo = bpy.data.objects.new(name, ld); link(lo, c_light); lo.location = loc
    lo.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler(); return lo

glow = point("OC_GlowLight", (0, -1.6, FISH_Z + 2.0), 320, (0.30, 0.62, 1.0), 1.0)      # just in front of the belly: neon spill on the water
point("OC_GlowLow", (0, -0.6, FISH_Z - 0.55), 150, (0.30, 0.62, 1.0), 0.6)               # near the tail tip, lights the water below
area("OC_Sky", (0, 0, 120), (0, 0, 0), 30000, 250, (0.50, 0.55, 0.95))   # huge dim overhead panel: soft fill
area("OC_Horizon", (0, 140, 22), (0, -13, 3), 3500, 120, (0.55, 0.62, 1.0))  # broad bright panel low behind the fish: crest highlights facing the camera
area("OC_FishKey", (-4, -12, 6), (0, 0, FISH_Z + 2.5), 260, 3, (0.85, 0.9, 1.0))        # soft key so the white shell reads                       # soft cool skylight

# ------------------------------------------------------------------ camera
cd = bpy.data.cameras.new("OC_Camera"); cam = bpy.data.objects.new("OC_Camera", cd); link(cam, c_env)
cam.location = (0.0, -13.0, 3.2)
target = Vector((0.0, 0.0, FISH_Z + 2.4))
cam.rotation_euler = (math.radians(90 + 4.0), 0, 0)          # look along +Y, pitched up 4 deg -> horizon low in frame
cd.lens = 35; cd.sensor_width = 36
cd.dof.use_dof = True; cd.dof.focus_distance = (target - cam.location).length; cd.dof.aperture_fstop = 2.0
sc.camera = cam

# ------------------------------------------------------------------ render / look
sc.render.engine = 'BLENDER_EEVEE'
sc.render.resolution_x = 1920; sc.render.resolution_y = 1080; sc.render.resolution_percentage = 50
sc.render.film_transparent = False
ee = sc.eevee
for attr, val in (("use_raytracing", True), ("volumetric_end", 800.0), ("volumetric_tile_size", '4'),
                  ("volumetric_samples", 128), ("taa_render_samples", 96), ("use_shadows", True)):
    try: setattr(ee, attr, val)
    except Exception: pass
sc.view_settings.view_transform = 'AgX'
try: sc.view_settings.look = 'AgX - Medium High Contrast'
except Exception: pass
sc.view_settings.exposure = 0.0

# bloom via compositor (Blender 5: node group on the scene, Glare type is a menu socket)
bloom_state = "skipped"
try:
    sc.render.use_compositing = True
    ng = bpy.data.node_groups.get("OC_Comp") or bpy.data.node_groups.new("OC_Comp", 'CompositorNodeTree')
    sc.compositing_node_group = ng
    ng.nodes.clear()
    if not any(getattr(s, "in_out", "") == 'OUTPUT' for s in ng.interface.items_tree):
        ng.interface.new_socket("Image", in_out='OUTPUT', socket_type='NodeSocketColor')
    rl = ng.nodes.new("CompositorNodeRLayers"); rl.scene = sc
    gl = ng.nodes.new("CompositorNodeGlare"); go = ng.nodes.new("NodeGroupOutput")
    mix = None
    ng.links.new(rl.outputs["Image"], gl.inputs["Image"])
    # film grain: a tileable noise image generated here, overlaid after the glare
    import numpy as np
    GW, GH = 1920, 1080
    g = np.random.default_rng(11).normal(0.5, 0.11, (GH, GW)).astype(np.float32)
    g = np.clip(g, 0, 1)
    rgba = np.empty((GH, GW, 4), np.float32); rgba[..., 0] = g; rgba[..., 1] = g; rgba[..., 2] = g; rgba[..., 3] = 1
    gimg = bpy.data.images.get("OC_Grain")
    if gimg: bpy.data.images.remove(gimg)
    gimg = bpy.data.images.new("OC_Grain", GW, GH, alpha=True); gimg.colorspace_settings.name = 'Non-Color'
    gimg.pixels.foreach_set(rgba.ravel()); gimg.pack()
    gnode = ng.nodes.new("CompositorNodeImage"); gnode.image = gimg
    gmix = ng.nodes.new("ShaderNodeMix"); gmix.data_type = 'RGBA'; gmix.blend_type = 'OVERLAY'
    gmix.inputs[0].default_value = GRAIN
    ng.links.new(gl.outputs["Image"], gmix.inputs[6]); ng.links.new(gnode.outputs["Image"], gmix.inputs[7])
    ng.links.new(gmix.outputs[2], go.inputs[0])
    for val in ('BLOOM', 'Bloom'):
        try: gl.inputs["Type"].default_value = val; break
        except Exception: pass
    for nm, val in (("Threshold", 0.9), ("Strength", 0.45), ("Size", 8), ("Smoothness", 0.4)):
        if nm in gl.inputs:
            try: gl.inputs[nm].default_value = val
            except Exception: pass
    bloom_state = "ok, mist=%s" % (mix.bl_idname if mix else None)
except Exception as ex:
    sc.render.use_compositing = False; bloom_state = repr(ex)

sc.frame_set(60)
dg = bpy.context.evaluated_depsgraph_get()
oc_eval = ocean.evaluated_get(dg)
result = {"scene": sc.name, "ocean_verts": len(oc_eval.to_mesh().vertices) if oc_eval.to_mesh() else None,
          "fish_parts": len(fish_objs), "bloom": bloom_state}
oc_eval.to_mesh_clear()

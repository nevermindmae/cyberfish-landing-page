"""Seafloor backdrop for the floor chapter — run inside Blender (via the MCP or the Text editor).

Builds (or rebuilds) a scene named "Seafloor":
  * SF_Terrain: rolling dunes with soft drapery folds, dark cool sand with ripple bump,
    a pool of caustics where the light from above lands
  * SF_Rock_*: chunky faceted rocks (6 base shapes, linked duplicates) framing the
    left and right of the frame, fading into the distance, plus small pebbles
  * one shaft of light from the upper right through a thin blue water volume,
    a grazing back light for the dune crests, a dim overhead fill
  * SF_Cam matching the three.js floor camera, SF_MarkAnchor where the particle mark hangs

NO particles / logo — the mark cloud is done in three.js.

Coordinates are laid out so the scene drops straight into `Floor.root` in src/scene/floor.ts:
the camera sits at the origin (Blender Z-up; glTF export converts to three's Y-up:
three (x, y, z) = blender (x, z, -y)). Mean sand level is FLOOR_Y = -5.2.

Everything this script owns is prefixed SF_ so it can be re-run safely.
Globals that may be injected before exec: RES (terrain grid subdivisions), SEED.
"""
import bpy, bmesh, math, random
from mathutils import Vector, noise

RES = globals().get("RES", 280)
SEED = globals().get("SEED", 7)

FLOOR_Y = -5.2                      # three.js: camera height above mean sand
LOOK = Vector((0.0, 10.0, -0.9))    # three LOOK_OFFSET (0, -0.9, -10)
FOV_V = 28.0                        # three FOV_LANDSCAPE (vertical)
MARK = Vector((0.0, 11.0, -0.3))    # three MARK_POS (0, -0.3, -11)
POOL = (9.0, 21.0)                  # three POOL (9, -21): where the light lands
POOL_R = 6.5

SAND = (0.018, 0.032, 0.080)
ROCK = (0.028, 0.038, 0.062)
CAUSTIC = (0.62, 0.82, 1.0)         # #9fd2ff-ish (linear, slightly brightened)
FOG = (0.0012, 0.0025, 0.0065)      # #02050c

# ------------------------------------------------------------------ scene
sc = bpy.data.scenes.get("Seafloor") or bpy.data.scenes.new("Seafloor")
bpy.context.window.scene = sc
for o in list(sc.objects):
    if o.name.startswith("SF_"):
        bpy.data.objects.remove(o, do_unlink=True)
for blk in (bpy.data.meshes, bpy.data.lights, bpy.data.cameras, bpy.data.materials):
    for d in list(blk):
        if d.name.startswith("SF_") and d.users == 0:
            blk.remove(d)
root = sc.collection

def coll(name):
    c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if c.name not in root.children:
        root.children.link(c)
    return c

C_GROUND, C_ROCKS, C_LIGHT = coll("SF_Ground"), coll("SF_Rocks"), coll("SF_Lights")

# ------------------------------------------------------------------ height field
def fbm(x, y, octaves=5, seed=0.0):
    v, a, f = 0.0, 0.5, 1.0
    for _ in range(octaves):
        v += a * noise.noise(Vector((x * f + seed, y * f - seed, seed * 0.37)), noise_basis='PERLIN_NEW')
        f *= 2.03
        a *= 0.5
    return v                       # roughly -1..1

def bump(x, y, cx, cy, sx, sy, h):
    return h * math.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2))

def height(x, y):
    """Sand height above FLOOR_Y at blender (x, y)."""
    # Broad dunes.
    h = fbm(x * 0.035, y * 0.035, 5, 3.1) * 2.6
    # Drapery folds: ridged noise stretched across the view, like silk laid over the bed.
    u = x * 0.055 + y * 0.020
    v = y * 0.090 - x * 0.015
    ridge = 1.0 - abs(fbm(u, v, 4, 11.7))
    h += (ridge ** 3) * 1.4
    # Framing: a dark dune rising on the left, a long fold behind the mark,
    # a pale sand mound in the lower right where the light pool is.
    h += bump(x, y, -15, 30, 9, 12, 3.2)
    h += bump(x, y, -28, 48, 14, 18, 5.5)
    h += bump(x, y, 4, 46, 26, 7, 2.6)
    h += bump(x, y, 22, 55, 14, 16, 4.5)
    h += bump(x, y, 8, 19, 6, 5, 0.9)
    # Keep the sand under the mark low and calm so it stays the subject.
    h -= bump(x, y, 0, 18, 5, 6, 0.8)
    # Dunes rise a little with distance so the horizon never shows as a flat line.
    h += max(0.0, y - 40) * 0.035
    return h

# ------------------------------------------------------------------ terrain
X0, X1, Y0, Y1 = -60.0, 60.0, -6.0, 114.0
me = bpy.data.meshes.new("SF_Terrain")
bm = bmesh.new()
bmesh.ops.create_grid(bm, x_segments=RES, y_segments=RES, size=0.5)
uv = bm.loops.layers.uv.new("UVMap")
for vtx in bm.verts:
    gx, gy = vtx.co.x + 0.5, vtx.co.y + 0.5          # 0..1
    x = X0 + gx * (X1 - X0)
    y = Y0 + gy * (Y1 - Y0)
    vtx.co = Vector((x, y, FLOOR_Y + height(x, y)))
for f in bm.faces:
    for l in f.loops:
        l[uv].uv = ((l.vert.co.x - X0) / (X1 - X0), (l.vert.co.y - Y0) / (Y1 - Y0))
bm.to_mesh(me); bm.free()
for p in me.polygons:
    p.use_smooth = True
terrain = bpy.data.objects.new("SF_Terrain", me)
C_GROUND.objects.link(terrain)

# ------------------------------------------------------------------ materials
def node_mat(name):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    return m, nt, nt.nodes, nt.links

def sand_material():
    m, nt, N, L = node_mat("SF_Sand")
    out = N.new("ShaderNodeOutputMaterial"); out.location = (1100, 0)
    bsdf = N.new("ShaderNodeBsdfPrincipled"); bsdf.location = (800, 0)
    bsdf.inputs["Roughness"].default_value = 0.88
    bsdf.inputs["Sheen Weight"].default_value = 0.55
    bsdf.inputs["Sheen Roughness"].default_value = 0.35
    bsdf.inputs["Sheen Tint"].default_value = (0.55, 0.7, 1.0, 1.0)
    tc = N.new("ShaderNodeTexCoord"); tc.location = (-1200, 0)
    geo = N.new("ShaderNodeNewGeometry"); geo.location = (-1200, -350)

    # Albedo: dark sand with slow tonal patches.
    patch = N.new("ShaderNodeTexNoise"); patch.location = (-800, 300)
    patch.inputs["Scale"].default_value = 0.06
    patch.inputs["Detail"].default_value = 3
    ramp = N.new("ShaderNodeValToRGB"); ramp.location = (-550, 300)
    ramp.color_ramp.elements[0].color = (SAND[0] * 0.6, SAND[1] * 0.6, SAND[2] * 0.6, 1)
    ramp.color_ramp.elements[1].color = (SAND[0] * 1.5, SAND[1] * 1.45, SAND[2] * 1.3, 1)
    L.new(tc.outputs["Object"], patch.inputs["Vector"])
    L.new(patch.outputs["Fac"], ramp.inputs["Fac"])
    L.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])

    # Bump: wind ripples + fine grain.
    wave = N.new("ShaderNodeTexWave"); wave.location = (-800, -100)
    wave.wave_type = 'BANDS'; wave.bands_direction = 'DIAGONAL'
    wave.inputs["Scale"].default_value = 0.9
    wave.inputs["Distortion"].default_value = 7.0
    wave.inputs["Detail"].default_value = 2.0
    wave.inputs["Detail Scale"].default_value = 1.5
    grain = N.new("ShaderNodeTexNoise"); grain.location = (-800, -380)
    grain.inputs["Scale"].default_value = 60
    grain.inputs["Detail"].default_value = 6
    mixb = N.new("ShaderNodeMix"); mixb.location = (-500, -200)
    mixb.data_type = 'FLOAT'; mixb.inputs["Factor"].default_value = 0.25
    L.new(tc.outputs["Object"], wave.inputs["Vector"])
    L.new(tc.outputs["Object"], grain.inputs["Vector"])
    L.new(wave.outputs["Fac"], mixb.inputs["A"])
    L.new(grain.outputs["Fac"], mixb.inputs["B"])
    bump_n = N.new("ShaderNodeBump"); bump_n.location = (-250, -200)
    bump_n.inputs["Strength"].default_value = 0.22
    bump_n.inputs["Distance"].default_value = 0.04
    L.new(mixb.outputs["Result"], bump_n.inputs["Height"])
    L.new(bump_n.outputs["Normal"], bsdf.inputs["Normal"])

    # Caustics: thin bright lines where Voronoi cells meet, only inside the light pool.
    vor = N.new("ShaderNodeTexVoronoi"); vor.location = (-800, -650)
    vor.feature = 'DISTANCE_TO_EDGE'
    vor.inputs["Scale"].default_value = 1.7
    vor.inputs["Randomness"].default_value = 0.9
    cmap = N.new("ShaderNodeMapRange"); cmap.location = (-550, -650)
    cmap.inputs["From Min"].default_value = 0.0
    cmap.inputs["From Max"].default_value = 0.028
    cmap.inputs["To Min"].default_value = 1.0
    cmap.inputs["To Max"].default_value = 0.0
    # Warp the cells so the web wobbles like refracted light instead of tiling.
    warp = N.new("ShaderNodeTexNoise"); warp.location = (-1000, -650)
    warp.inputs["Scale"].default_value = 0.6
    wsub = N.new("ShaderNodeVectorMath"); wsub.location = (-900, -750)
    wsub.operation = 'MULTIPLY_ADD'
    wsub.inputs[1].default_value = (1.8, 1.8, 0.0)
    L.new(tc.outputs["Object"], warp.inputs["Vector"])
    L.new(warp.outputs["Color"], wsub.inputs[0])
    L.new(tc.outputs["Object"], wsub.inputs[2])
    L.new(wsub.outputs["Vector"], vor.inputs["Vector"])
    L.new(vor.outputs["Distance"], cmap.inputs["Value"])
    # pool mask = exp(-(d/R)^2 * 1.4), d = distance to POOL in xy
    sep = N.new("ShaderNodeVectorMath"); sep.location = (-800, -900)
    sep.operation = 'DISTANCE'
    sep.inputs[1].default_value = (POOL[0], POOL[1], FLOOR_Y)
    flat = N.new("ShaderNodeVectorMath"); flat.location = (-1000, -900)
    flat.operation = 'MULTIPLY'; flat.inputs[1].default_value = (1, 1, 0)
    flat_off = N.new("ShaderNodeVectorMath"); flat_off.location = (-900, -1000)
    flat_off.operation = 'ADD'; flat_off.inputs[1].default_value = (0, 0, FLOOR_Y)
    L.new(geo.outputs["Position"], flat.inputs[0])
    L.new(flat.outputs["Vector"], flat_off.inputs[0])
    L.new(flat_off.outputs["Vector"], sep.inputs[0])
    dn = N.new("ShaderNodeMath"); dn.location = (-600, -900)
    dn.operation = 'DIVIDE'; dn.inputs[1].default_value = POOL_R
    L.new(sep.outputs["Value"], dn.inputs[0])
    sq = N.new("ShaderNodeMath"); sq.location = (-450, -900)
    sq.operation = 'POWER'; sq.inputs[1].default_value = 2.0
    L.new(dn.outputs["Value"], sq.inputs[0])
    neg = N.new("ShaderNodeMath"); neg.location = (-300, -900)
    neg.operation = 'MULTIPLY'; neg.inputs[1].default_value = -1.4
    L.new(sq.outputs["Value"], neg.inputs[0])
    ex = N.new("ShaderNodeMath"); ex.location = (-150, -900)
    ex.operation = 'EXPONENT'
    L.new(neg.outputs["Value"], ex.inputs[0])
    cpow = N.new("ShaderNodeMath"); cpow.location = (-300, -650)
    cpow.operation = 'POWER'; cpow.inputs[1].default_value = 2.2
    L.new(cmap.outputs["Result"], cpow.inputs[0])
    cm = N.new("ShaderNodeMath"); cm.location = (0, -700)
    cm.operation = 'MULTIPLY'
    L.new(cpow.outputs["Value"], cm.inputs[0])
    L.new(ex.outputs["Value"], cm.inputs[1])
    cs = N.new("ShaderNodeMath"); cs.location = (200, -700)
    cs.operation = 'MULTIPLY'; cs.inputs[1].default_value = 0.14
    L.new(cm.outputs["Value"], cs.inputs[0])
    bsdf.inputs["Emission Color"].default_value = (*CAUSTIC, 1)
    L.new(cs.outputs["Value"], bsdf.inputs["Emission Strength"])
    L.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return m

def rock_material():
    m, nt, N, L = node_mat("SF_Rock")
    out = N.new("ShaderNodeOutputMaterial"); out.location = (1000, 0)
    bsdf = N.new("ShaderNodeBsdfPrincipled"); bsdf.location = (700, 0)
    bsdf.inputs["Roughness"].default_value = 0.72
    bsdf.inputs["Specular IOR Level"].default_value = 0.35
    tc = N.new("ShaderNodeTexCoord"); tc.location = (-1000, 0)
    geo = N.new("ShaderNodeNewGeometry"); geo.location = (-1000, -400)
    n1 = N.new("ShaderNodeTexNoise"); n1.location = (-700, 200)
    n1.inputs["Scale"].default_value = 2.5; n1.inputs["Detail"].default_value = 8
    n1.inputs["Roughness"].default_value = 0.62
    vor = N.new("ShaderNodeTexVoronoi"); vor.location = (-700, -100)
    vor.inputs["Scale"].default_value = 4.0
    L.new(tc.outputs["Object"], n1.inputs["Vector"])
    L.new(tc.outputs["Object"], vor.inputs["Vector"])
    ramp = N.new("ShaderNodeValToRGB"); ramp.location = (-400, 200)
    ramp.color_ramp.elements[0].color = (ROCK[0] * 0.5, ROCK[1] * 0.5, ROCK[2] * 0.5, 1)
    ramp.color_ramp.elements[1].color = (ROCK[0] * 2.2, ROCK[1] * 2.2, ROCK[2] * 2.0, 1)
    L.new(n1.outputs["Fac"], ramp.inputs["Fac"])
    # Sand settled on the tops: mix toward sand where the normal faces up.
    sepn = N.new("ShaderNodeSeparateXYZ"); sepn.location = (-700, -400)
    L.new(geo.outputs["Normal"], sepn.inputs["Vector"])
    top = N.new("ShaderNodeMapRange"); top.location = (-450, -400)
    top.inputs["From Min"].default_value = 0.55; top.inputs["From Max"].default_value = 0.9
    L.new(sepn.outputs["Z"], top.inputs["Value"])
    tmask = N.new("ShaderNodeMath"); tmask.location = (-250, -400)
    tmask.operation = 'MULTIPLY'
    L.new(top.outputs["Result"], tmask.inputs[0])
    L.new(n1.outputs["Fac"], tmask.inputs[1])
    mixc = N.new("ShaderNodeMix"); mixc.location = (200, 150)
    mixc.data_type = 'RGBA'
    mixc.inputs["B"].default_value = (SAND[0] * 1.3, SAND[1] * 1.3, SAND[2] * 1.2, 1)
    L.new(tmask.outputs["Value"], mixc.inputs["Factor"])
    L.new(ramp.outputs["Color"], mixc.inputs["A"])
    L.new(mixc.outputs["Result"], bsdf.inputs["Base Color"])
    mb = N.new("ShaderNodeMath"); mb.location = (-400, -100)
    mb.operation = 'ADD'
    L.new(n1.outputs["Fac"], mb.inputs[0])
    L.new(vor.outputs["Distance"], mb.inputs[1])
    bn = N.new("ShaderNodeBump"); bn.location = (300, -200)
    bn.inputs["Strength"].default_value = 0.6
    bn.inputs["Distance"].default_value = 0.08
    L.new(mb.outputs["Value"], bn.inputs["Height"])
    L.new(bn.outputs["Normal"], bsdf.inputs["Normal"])
    L.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return m

sand, rock = sand_material(), rock_material()
terrain.data.materials.append(sand)

# ------------------------------------------------------------------ rocks
def make_rock(name, seed):
    rnd = random.Random(seed)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=4, radius=1.0)
    # Chunky facets: clamp the sphere against a handful of random planes.
    planes = []
    for _ in range(rnd.randint(7, 11)):
        n = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-0.6, 1))).normalized()
        planes.append((n, rnd.uniform(0.55, 0.85)))
    stretch = Vector((rnd.uniform(0.9, 1.4), rnd.uniform(0.8, 1.2), rnd.uniform(0.75, 1.1)))
    off = rnd.uniform(0, 100)
    for v in bm.verts:
        p = v.co.copy()
        for n, d in planes:
            k = p.dot(n)
            if k > d:
                p -= n * (k - d)
        r = 1.0 + 0.18 * noise.fractal(p * 1.3 + Vector((off, 0, 0)), 0.8, 2.0, 4) \
                + 0.05 * noise.noise(p * 5.0 + Vector((0, off, 0)))
        p *= r
        p = Vector((p.x * stretch.x, p.y * stretch.y, p.z * stretch.z))
        p.z = max(p.z, -0.5 * stretch.z)        # flat bottom, sits in the sand
        v.co = p
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(rock)
    return me

ROCK_MESHES = [make_rock(f"SF_RockMesh_{i}", SEED * 31 + i) for i in range(6)]

# (x, y, size): framing boulders left and right of the mark, silhouettes deeper in,
# and pebbles near the bottom of the frame. The sand under the mark stays clear.
PLACES = [
    (-6.4, 18.5, 2.0), (-9.2, 23.0, 3.0), (-4.9, 16.8, 0.55), (-11.5, 19.5, 1.2),
    (6.6, 19.5, 1.6), (10.0, 26.0, 2.8), (4.8, 17.6, 0.5), (12.0, 21.0, 1.0),
    (-13.0, 32.0, 3.0), (14.5, 34.0, 3.4), (-2.5, 43.0, 2.2), (3.4, 31.0, 0.95),
    (-21.0, 45.0, 4.8), (23.0, 50.0, 5.2), (7.0, 58.0, 3.6), (-9.0, 62.0, 4.2),
    (-2.4, 16.4, 0.22), (1.6, 15.9, 0.18), (2.9, 18.2, 0.30), (-3.5, 19.4, 0.34),
    (0.4, 20.0, 0.14), (-0.9, 22.5, 0.24), (2.1, 21.4, 0.38), (-1.6, 26.0, 0.45),
    (5.6, 23.5, 0.32), (-5.5, 25.5, 0.6),
]
rnd = random.Random(SEED)
for i, (x, y, s) in enumerate(PLACES):
    me = ROCK_MESHES[i % len(ROCK_MESHES)]
    o = bpy.data.objects.new(f"SF_Rock_{i:02d}", me)
    # Sink by a third of the size so it reads as half buried.
    o.location = (x, y, FLOOR_Y + height(x, y) - 0.04 * s)
    o.rotation_euler = (rnd.uniform(-0.15, 0.15), rnd.uniform(-0.15, 0.15), rnd.uniform(0, math.tau))
    o.scale = (s, s * rnd.uniform(0.85, 1.15), s * rnd.uniform(0.8, 1.1))
    C_ROCKS.objects.link(o)

# ------------------------------------------------------------------ water volume + world
vol_me = bpy.data.meshes.new("SF_WaterVolume")
bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0); bm.to_mesh(vol_me); bm.free()
vol = bpy.data.objects.new("SF_WaterVolume", vol_me)
vol.location = (0, 50, 14); vol.scale = (130, 125, 44)
m, nt, N, L = node_mat("SF_Water")
o_ = N.new("ShaderNodeOutputMaterial"); pv = N.new("ShaderNodeVolumePrincipled")
pv.inputs["Color"].default_value = (0.25, 0.48, 1.0, 1)
pv.inputs["Density"].default_value = 0.008
pv.inputs["Anisotropy"].default_value = 0.7
pv.inputs["Absorption Color"].default_value = (0.12, 0.3, 0.85, 1)
L.new(pv.outputs["Volume"], o_.inputs["Volume"])
vol_me.materials.append(m)
vol.visible_shadow = True
C_GROUND.objects.link(vol)

world = bpy.data.worlds.get("SF_World") or bpy.data.worlds.new("SF_World")
world.use_nodes = True
bg = world.node_tree.nodes.get("Background")
bg.inputs["Color"].default_value = (FOG[0] * 2, FOG[1] * 2.5, FOG[2] * 3, 1)
bg.inputs["Strength"].default_value = 1.0
sc.world = world

# ------------------------------------------------------------------ lights
def light(name, kind, loc, target, energy, color, **kw):
    d = bpy.data.lights.new(name, kind)
    d.energy = energy; d.color = color
    for k, v in kw.items():
        setattr(d, k, v)
    o = bpy.data.objects.new(name, d)
    o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    C_LIGHT.objects.link(o)
    return o

# The shaft: from high up on the right, down onto the pool.
shaft = light("SF_Shaft", 'SPOT', (12.0, 27.0, 40.0), (POOL[0], POOL[1], FLOOR_Y), 300000,
      (0.62, 0.8, 1.0), spot_size=math.radians(13), spot_blend=1.0, shadow_soft_size=6.0)
# Grazing back light: picks out dune crests and rock rims against the dark.
# A point light, not an area: an area light leaves a hard edge in the water along its plane.
back = light("SF_Back", 'POINT', (26.0, 85.0, 12.0), (0.0, 20.0, FLOOR_Y), 70000,
      (0.4, 0.6, 1.0), shadow_soft_size=10.0)
back.visible_camera = False      # it still lights the water: the blue glow upper right
# Dim overhead fill so the troughs are not dead black.
fill = light("SF_Fill", 'AREA', (0.0, 30.0, 25.0), (0.0, 30.0, FLOOR_Y), 1800,
      (0.5, 0.65, 1.0), shape='DISK', size=50)
fill.visible_camera = False; fill.visible_volume_scatter = False

# ------------------------------------------------------------------ camera + mark anchor
cd = bpy.data.cameras.new("SF_Cam")
cd.sensor_fit = 'VERTICAL'; cd.angle_y = math.radians(FOV_V)
cd.clip_start = 0.1; cd.clip_end = 400
cam = bpy.data.objects.new("SF_Cam", cd)
cam.location = (0, 0, 0)
cam.rotation_euler = LOOK.to_track_quat('-Z', 'Y').to_euler()
root.objects.link(cam)
sc.camera = cam

anchor = bpy.data.objects.new("SF_MarkAnchor", None)
anchor.empty_display_type = 'PLAIN_AXES'; anchor.empty_display_size = 1.2
anchor.location = MARK
root.objects.link(anchor)

# ------------------------------------------------------------------ render settings
sc.render.engine = 'CYCLES'
sc.cycles.samples = 128
sc.cycles.use_denoising = True
sc.cycles.volume_step_rate = 2.0
sc.cycles.max_bounces = 6
sc.render.resolution_x, sc.render.resolution_y = 1920, 1080
sc.render.resolution_percentage = 100
sc.view_settings.view_transform = 'AgX'
try:
    sc.view_settings.look = 'AgX - Punchy'
except TypeError:
    pass
sc.view_settings.exposure = 0.35

result = {"terrain_verts": len(terrain.data.vertices),
          "rocks": len(PLACES), "scene": sc.name}

"""CyberFish builder — run inside Blender (exec'd via the Blender MCP).

Builds a koi-style fish from parametric cross-sections, fan fins, a forked
koi tail and eyes. The fish is modelled straight along +Y (nose at +Y) and
then posed onto an S-shaped spine with a roll (twist) that increases toward
the tail — done in Python, vertex by vertex, so no deform modifiers are left
on the export. Wide fins are attached rigidly to the spine frame so they are
not smeared by the bend. All meshes carry clean UVs for texturing.

Globals that may be injected before exec: POSE (bool), TILT_TAIL, TILT_HEAD.
"""
import bpy, bmesh, math, bisect
from mathutils import Vector, Matrix

POSE = globals().get("POSE", True)
TILT_TAIL = math.radians(globals().get("TILT_TAIL", -72.0))
TILT_HEAD = math.radians(globals().get("TILT_HEAD", 0.0))

# ------------------------------------------------------------------ helpers
def spline(points, t):
    ts = [p[0] for p in points]; vs = [p[1] for p in points]; n = len(points)
    if t <= ts[0]: return vs[0]
    if t >= ts[-1]: return vs[-1]
    i = min(max(bisect.bisect_right(ts, t) - 1, 0), n - 2)
    s = (t - ts[i]) / (ts[i + 1] - ts[i])
    p1, p2 = vs[i], vs[i + 1]
    p0 = vs[i - 1] if i > 0 else 2 * p1 - p2
    p3 = vs[i + 2] if i + 2 < n else 2 * p2 - p1
    return 0.5 * ((2 * p1) + (-p0 + p2) * s + (2 * p0 - 5 * p1 + 4 * p2 - p3) * s * s
                  + (-p0 + 3 * p1 - 3 * p2 + p3) * s ** 3)

def nrm(v):
    v = Vector(v); v.normalize(); return v

def link(obj):
    coll.objects.link(obj)

# ------------------------------------------------------------------ body def
Y_NOSE = 6.2; L = 4.0
H  = [(0, 0.0), (0.014, 0.13), (0.04, 0.23), (0.08, 0.34), (0.15, 0.53), (0.3, 0.72),
      (0.45, 0.70), (0.6, 0.58), (0.75, 0.42), (0.9, 0.27), (1.0, 0.21)]
Wd = [(0, 0.0), (0.014, 0.22), (0.04, 0.31), (0.08, 0.38), (0.15, 0.44), (0.3, 0.50),
      (0.45, 0.48), (0.6, 0.38), (0.75, 0.26), (0.9, 0.15), (1.0, 0.09)]
ZC = [(0, -0.20), (0.04, -0.14), (0.08, -0.09), (0.15, -0.03), (0.4, 0.0), (1.0, 0.06)]

def surf(t, ang):
    """Straight body surface. ang: 0 = belly, +pi = back (via +x side)."""
    h = spline(H, t); w = spline(Wd, t); zc = spline(ZC, t)
    c = math.cos(ang); s = math.sin(ang)
    k = 0.5 * (1 - c)                    # 0 belly .. 1 back
    wx = w * (1.0 - 0.28 * k * k)        # back narrower than belly
    hz = h * (0.92 if c > 0 else 1.0)
    # robotic muzzle: the cross-section blends from a superellipse (boxy, n=3.6) at the
    # nose to a plain ellipse (n=2) by t = 0.24, so the head reads as a machined housing
    f = min(max(t / 0.24, 0.0), 1.0); f = f * f * (3 - 2 * f)
    n = 3.6 * (1 - f) + 2.0 * f; e = 2.0 / n
    sx = math.copysign(abs(s) ** e, s); cz = math.copysign(abs(c) ** e, c)
    return Vector((wx * sx, Y_NOSE - L * t, zc - hz * cz))

def surf_normal(t, ang):
    e = 1e-3
    p = surf(t, ang)
    n = (surf(t, ang + e) - surf(t, ang - e)).cross(surf(t + e, ang) - surf(t - e, ang))
    n.normalize()
    centre = Vector((0, p.y, spline(ZC, t)))
    if (p - centre).dot(n) < 0: n = -n
    return n

# ------------------------------------------------------------------ spine (pose)
SPINE_PTS = [Vector(p) for p in ((0.05, -1.0, -0.1), (0.80, 1.6, 0.0), (0.05, 3.6, 0.0), (-0.60, 5.0, 0.10), (0.05, 7.0, 0.55))]
Y_START = -1.0
TAIL_TIP_Y = Y_NOSE - L - 2.3

def _cr(p0, p1, p2, p3, s):
    return 0.5 * ((2 * p1) + (-p0 + p2) * s + (2 * p0 - 5 * p1 + 4 * p2 - p3) * s * s + (-p0 + 3 * p1 - 3 * p2 + p3) * s ** 3)

_dense = []
P = SPINE_PTS
for i in range(len(P) - 1):
    p0 = P[i - 1] if i > 0 else 2 * P[i] - P[i + 1]
    p3 = P[i + 2] if i + 2 < len(P) else 2 * P[i + 1] - P[i]
    for k in range(200):
        _dense.append(_cr(p0, P[i], P[i + 1], p3, k / 200))
_dense.append(P[-1])
_arc = [0.0]
for i in range(1, len(_dense)):
    _arc.append(_arc[-1] + (_dense[i] - _dense[i - 1]).length)
_T = []; _N = []; _B = []
for i in range(len(_dense)):
    a = _dense[max(i - 1, 0)]; b = _dense[min(i + 1, len(_dense) - 1)]
    _T.append(nrm(b - a))
n0 = Vector((1, 0, 0)); n0 = nrm(n0 - _T[0] * n0.dot(_T[0]))
_N.append(n0); _B.append(n0.cross(_T[0]))          # B = N x T  (+Z for a +Y spine)
for i in range(1, len(_dense)):
    n = nrm(_N[-1] - _T[i] * _N[-1].dot(_T[i]))
    _N.append(n); _B.append(n.cross(_T[i]))

def roll_at(y):
    f = (y - TAIL_TIP_Y) / (Y_NOSE - TAIL_TIP_Y)       # 0 tail tip .. 1 nose
    f = min(max(f, 0.0), 1.0)
    f = f * f * (3 - 2 * f)
    return TILT_TAIL * (1 - f) + TILT_HEAD * f

def frame_at(y):
    s = y - Y_START
    if s <= 0:
        i = 0; pos = _dense[0] + _T[0] * s
    elif s >= _arc[-1]:
        i = len(_dense) - 1; pos = _dense[-1] + _T[-1] * (s - _arc[-1])
    else:
        i = bisect.bisect_right(_arc, s) - 1
        f = (s - _arc[i]) / max(_arc[i + 1] - _arc[i], 1e-9)
        pos = _dense[i].lerp(_dense[i + 1], f)
    T, N, B = _T[i], _N[i], _B[i]
    r = roll_at(y); c, sn = math.cos(r), math.sin(r)
    return pos, T, N * c + B * sn, -N * sn + B * c

def pose_spine(p):
    if not POSE: return Vector(p)
    pos, T, N, B = frame_at(p.y)
    return pos + N * p.x + B * p.z

def pose_rigid_fn(y_ref):
    if not POSE: return lambda p: Vector(p)
    pos, T, N, B = frame_at(y_ref)
    return lambda p: pos + N * p.x + T * (p.y - y_ref) + B * p.z

# ------------------------------------------------------------------ mesh builders
def mesh_from_grid(name, grid, uv_fn, close_u=False, close_v=False, caps=(), xform=lambda p: p):
    bm = bmesh.new(); uv_layer = bm.loops.layers.uv.new("UVMap")
    verts = [[bm.verts.new(xform(p)) for p in row] for row in grid]
    ni, nj = len(grid), len(grid[0])
    for i in range(ni if close_v else ni - 1):
        i2 = (i + 1) % ni
        for j in range(nj if close_u else nj - 1):
            j2 = (j + 1) % nj
            try:
                f = bm.faces.new([verts[i][j], verts[i][j2], verts[i2][j2], verts[i2][j]])
            except ValueError:
                continue
            ju = j + 1 if close_u else j2; iu = i + 1 if close_v else i2
            for l, uv in zip(f.loops, [uv_fn(i, j), uv_fn(i, ju), uv_fn(iu, ju), uv_fn(iu, j)]):
                l[uv_layer].uv = uv
    for cap in caps:
        cap_pt, row_idx, cap_uv = cap[:3]
        rim_uv = cap[3] if len(cap) > 3 else None          # optional: own UV island for the cap (rim uv per column j)
        cv = bm.verts.new(xform(cap_pt)); row = verts[row_idx]
        for j in range(nj):
            j2 = (j + 1) % nj
            if row_idx == 0:
                vs = [cv, row[j2], row[j]]
                uvs = [cap_uv, rim_uv(j + 1), rim_uv(j)] if rim_uv else [cap_uv, uv_fn(0, j + 1), uv_fn(0, j)]
            else:
                vs = [cv, row[j], row[j2]]
                uvs = [cap_uv, rim_uv(j), rim_uv(j + 1)] if rim_uv else [cap_uv, uv_fn(row_idx, j), uv_fn(row_idx, j + 1)]
            try:
                f = bm.faces.new(vs)
            except ValueError:
                continue
            for l, uv in zip(f.loops, uvs):
                l[uv_layer].uv = uv
    bm.normal_update()
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    return me

FIN_SUB = 3            # interpolated membrane rows between two bony rays
RAY_THICK = 0.026      # fin thickness on a ray
MEMBRANE_FACTOR = 0.28 # membrane thickness as a fraction of the ray thickness

def _lerp_ray(a, b, t):
    return dict(root=a["root"].lerp(b["root"], t), dir=(a["dir"].lerp(b["dir"], t)).normalized(),
                length=a["length"] * (1 - t) + b["length"] * t, curl=a["curl"].lerp(b["curl"], t))

def make_fin(name, rays, samples=10, uv_rect=(0, 0, 1, 1), thickness=None, xform=lambda p: p):
    """Fan fin. Bony rays are the given list; FIN_SUB membrane rows are interpolated between them and get
    a lower Solidify thickness through a vertex group -> real ribbing in the silhouette and shading."""
    thickness = thickness or RAY_THICK
    full, weights = [], []
    for i, r in enumerate(rays):
        full.append(r); weights.append(1.0)
        if i < len(rays) - 1:
            for k in range(1, FIN_SUB + 1):
                t = k / (FIN_SUB + 1)
                full.append(_lerp_ray(r, rays[i + 1], t))
                # membrane sags between rays: thinnest in the middle
                weights.append(0.0 + 0.25 * (abs(t - 0.5) * 2) ** 2)
    grid = []
    for r in full:
        row = []
        for k in range(samples + 1):
            f = k / samples
            row.append(r["root"] + r["dir"] * (r["length"] * f) + r["curl"] * (f * f))
        grid.append(row)
    u0, v0, u1, v1 = uv_rect; nr = len(full)
    uv = lambda i, j: (u0 + (u1 - u0) * i / (nr - 1), v0 + (v1 - v0) * j / samples)
    me = mesh_from_grid(name, grid, uv, xform=xform)
    ob = bpy.data.objects.new(name, me); link(ob)
    vg = ob.vertex_groups.new(name="Rays")
    for i, w in enumerate(weights):
        # mesh_from_grid creates verts row by row, (samples+1) per row; rays taper toward the edge
        for j in range(samples + 1):
            edge = j / samples
            vg.add([i * (samples + 1) + j], max(w, 0.0) * (1.0 - 0.45 * edge) + (1 - max(w, 0.0)) * 0.0, 'REPLACE')
    sol = ob.modifiers.new("Solidify", 'SOLIDIFY'); sol.thickness = thickness; sol.offset = 0
    sol.use_even_offset = True
    sol.vertex_group = "Rays"; sol.thickness_vertex_group = MEMBRANE_FACTOR
    return ob

# ------------------------------------------------------------------ scene prep
scene = bpy.context.scene
for n in ("Cube", "Light"):
    o = bpy.data.objects.get(n)
    if o: bpy.data.objects.remove(o, do_unlink=True)
for o in list(bpy.data.objects):
    if o.name.startswith("CF_"):
        bpy.data.objects.remove(o, do_unlink=True)
for blk in (bpy.data.meshes, bpy.data.curves, bpy.data.lights):
    for d in list(blk):
        if d.users == 0: blk.remove(d)
coll = bpy.data.collections.get("CyberFish")
if coll is None:
    coll = bpy.data.collections.new("CyberFish"); scene.collection.children.link(coll)

# ------------------------------------------------------------------ body mesh
NT, NA = 64, 40
T0 = 0.014
def t_of(i): return T0 + (1 - T0) * (i / NT) ** 1.15
grid = [[surf(t_of(i), -math.pi + 2 * math.pi * j / NA) for j in range(NA)] for i in range(NT + 1)]
# UV layout: the bottom strip (v < PLATE_H) is a separate island for the flat front plate (a disc of
# radius PLATE_R around (0.5, PLATE_C)); the body rings use v = PLATE_H + (1 - PLATE_H) * t.
PLATE_H, PLATE_C, PLATE_R = 0.12, 0.06, 0.055
body_uv = lambda i, j: (j / NA, PLATE_H + (1 - PLATE_H) * t_of(i))
def plate_rim_uv(j):
    ang = -math.pi + 2 * math.pi * j / NA
    return (0.5 + PLATE_R * math.sin(ang), PLATE_C - PLATE_R * math.cos(ang))
nose = Vector((0, Y_NOSE - L * (T0 - 0.003), spline(ZC, T0)))   # flat, very slightly dished front plate
tail_end = Vector((0, Y_NOSE - L, spline(ZC, 1)))
body_me = mesh_from_grid("CF_Body", grid, body_uv, close_u=True,
                         caps=[(nose, 0, (0.5, PLATE_C), plate_rim_uv), (tail_end, NT, (0.5, 1.0))], xform=pose_spine)
body = bpy.data.objects.new("CF_Body", body_me); link(body)

# ------------------------------------------------------------------ fins
fins = []
# --- dorsal (follows spine)
rays = []; m = 11
for i in range(m):
    f = i / (m - 1); t = 0.27 + 0.50 * f
    back = math.radians(28 + 42 * f)
    rays.append(dict(root=surf(t, math.pi), dir=nrm((0, -math.sin(back), math.cos(back))),
                     length=1.0 * (1 - 0.6 * f) + 0.05,
                     curl=Vector((0.10 * math.sin(f * math.pi * 2.0), -0.08, 0.0))))
fins.append(make_fin("CF_FinDorsal", rays, 10, (0.52, 0.52, 0.98, 0.98), xform=pose_spine))

# --- pectorals (rigid at their root)
for sgn, nm, rect in ((1, "CF_FinPectoral.L", (0.02, 0.02, 0.48, 0.48)), (-1, "CF_FinPectoral.R", (0.52, 0.02, 0.98, 0.48))):
    rays = []; m = 13
    for i in range(m):
        f = i / (m - 1)
        t = 0.20 + 0.08 * f; ang = sgn * (0.44 * math.pi + 0.05 * f)
        root = surf(t, ang); n = surf_normal(t, ang)
        theta = 0.55 + 0.85 * f               # swept back from the start
        d = nrm(n * math.cos(theta) + Vector((0, -1, 0)) * math.sin(theta) + Vector((0, 0, -0.35)))
        rays.append(dict(root=root, dir=d, length=0.22 + 0.95 * math.exp(-((f - 0.25) / 0.21) ** 2),
                         curl=Vector((sgn * 0.10 * math.sin(math.pi * f), -0.30 * f, -0.30 - 0.15 * math.sin(math.pi * f)))))
    fins.append(make_fin(nm, rays, 12, rect, xform=pose_rigid_fn(Y_NOSE - L * 0.22)))

# --- pelvics (rigid)
for sgn, nm, rect in ((1, "CF_FinPelvic.L", (0.02, 0.52, 0.24, 0.98)), (-1, "CF_FinPelvic.R", (0.27, 0.52, 0.49, 0.98))):
    rays = []; m = 9
    for i in range(m):
        f = i / (m - 1)
        t = 0.50 + 0.05 * f; ang = sgn * (0.22 * math.pi + 0.03 * f)
        root = surf(t, ang); n = surf_normal(t, ang)
        theta = 0.45 + 1.0 * f
        d = nrm(n * math.cos(theta) + Vector((0, -1, 0)) * math.sin(theta) + Vector((0, 0, -0.3)))
        rays.append(dict(root=root, dir=d, length=0.16 + 0.30 * math.exp(-((f - 0.3) / 0.3) ** 2),
                         curl=Vector((sgn * 0.05, -0.05, -0.12))))
    fins.append(make_fin(nm, rays, 8, rect, xform=pose_rigid_fn(Y_NOSE - L * 0.52)))

# --- anal (spine)
rays = []; m = 7
for i in range(m):
    f = i / (m - 1); t = 0.72 + 0.10 * f
    back = math.radians(35 + 35 * f)
    rays.append(dict(root=surf(t, 0.0), dir=nrm((0, -math.sin(back), -math.cos(back))),
                     length=0.42 * (1 - 0.45 * f) + 0.03,
                     curl=Vector((0.04 * math.sin(f * math.pi * 2), -0.05, 0))))
fins.append(make_fin("CF_FinAnal", rays, 8, (0.52, 0.52, 0.98, 0.98), xform=pose_spine))

# --- tail (spine; forked, long, flowing)
rays = []; m = 21
for i in range(m):
    f = i / (m - 1)                        # 0 = top lobe .. 1 = bottom lobe
    ang = math.pi * (1 - f)
    root = surf(0.975, ang); root.x *= 0.45
    phi = (0.5 - f) * 0.62
    fork = abs(f - 0.5) * 2
    rays.append(dict(root=root, dir=nrm((0, -math.cos(phi), math.sin(phi))),
                     length=1.55 + 1.25 * fork ** 1.6,
                     curl=Vector((0.28 * math.sin(f * math.pi * 2.0) + 0.12, -0.25, 0.55 * (0.5 - f)))))
fins.append(make_fin("CF_FinTail", rays, 16, (0.02, 0.02, 0.98, 0.98), thickness=0.03, xform=pose_spine))

# ------------------------------------------------------------------ eyes
eyes = []
def sphere_grid(r, nu=32, nv=16):
    g = []
    for i in range(nv + 1):
        th = math.pi * i / nv
        g.append([Vector((r * math.sin(th) * math.cos(2 * math.pi * j / nu), r * math.sin(th) * math.sin(2 * math.pi * j / nu), r * math.cos(th))) for j in range(nu)])
    return g
def torus_grid(R, r, nu=48, nv=10):
    g = []
    for i in range(nu):
        a = 2 * math.pi * i / nu
        row = []
        for j in range(nv):
            b = 2 * math.pi * j / nv
            row.append(Vector(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b))))
        g.append(row)
    return g

for sgn in (1, -1):
    t_e, ang_e = 0.072, sgn * 0.66 * math.pi
    p = surf(t_e, ang_e); n = surf_normal(t_e, ang_e)
    q = n.to_track_quat('Z', 'Y').to_matrix().to_4x4()
    rig = pose_rigid_fn(p.y)
    sfx = ".L" if sgn > 0 else ".R"
    M = Matrix.Translation(p - n * 0.028) @ q
    me = mesh_from_grid("CF_Eye" + sfx, sphere_grid(0.09), lambda i, j: (j / 32, i / 16), close_u=True,
                        xform=lambda v, M=M, rig=rig: rig(M @ v))
    eye = bpy.data.objects.new("CF_Eye" + sfx, me); link(eye); eyes.append(eye)
    M = Matrix.Translation(p + n * 0.008) @ q
    me = mesh_from_grid("CF_EyeRing" + sfx, torus_grid(0.088, 0.007), lambda i, j: (i / 48, j / 10), close_u=True, close_v=True,
                        xform=lambda v, M=M, rig=rig: rig(M @ v))
    ring = bpy.data.objects.new("CF_EyeRing" + sfx, me); link(ring); eyes.append(ring)

# ------------------------------------------------------------------ modifiers
parts = [body] + fins + eyes
for ob in parts:
    sub = ob.modifiers.new("Subdivision", 'SUBSURF')
    sub.levels = 2 if ob is body else 1
    sub.render_levels = 3 if ob is body else 2

# placeholder materials
def simple_mat(name, color, rough=0.3, coat=0.0, metal=0.0, emit=None):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    b = mat.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*color, 1); b.inputs["Roughness"].default_value = rough
    b.inputs["Coat Weight"].default_value = coat; b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = (*emit[0], 1); b.inputs["Emission Strength"].default_value = emit[1]
    return mat
shell = simple_mat("CF_Shell", (0.9, 0.92, 0.95), 0.3, 0.6)
for ob in [body] + fins:
    ob.data.materials.clear(); ob.data.materials.append(shell)
eye_mat = simple_mat("CF_EyeDark", (0.02, 0.05, 0.10), 0.06, 1.0)
ring_mat = simple_mat("CF_Glow", (0.2, 0.6, 1.0), 0.3, 0.0, 0.0, ((0.15, 0.55, 1.0), 8.0))
for ob in eyes:
    ob.data.materials.clear(); ob.data.materials.append(ring_mat if "Ring" in ob.name else eye_mat)

# ------------------------------------------------------------------ camera + lights
cam = bpy.data.objects.get("Camera")
if cam is None:
    cd = bpy.data.cameras.new("Camera"); cam = bpy.data.objects.new("Camera", cd); scene.collection.objects.link(cam); scene.camera = cam
cam.location = (0.0, 3.0, 13.0); cam.rotation_euler = (0, 0, 0)
cam.data.lens = 60; cam.data.sensor_fit = 'VERTICAL'; cam.data.sensor_height = 36
scene.render.resolution_x = 1080; scene.render.resolution_y = 1920
scene.render.resolution_percentage = 50

def area_light(name, loc, target, energy, size, color=(1, 1, 1)):
    ld = bpy.data.lights.new(name, 'AREA'); ld.energy = energy; ld.size = size; ld.color = color
    lo = bpy.data.objects.new(name, ld); link(lo); lo.location = loc
    lo.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    return lo
area_light("CF_Key", (-5, 7, 9), (0, 3.0, 0), 2400, 4)
area_light("CF_Fill", (6, 1, 7), (0, 3.0, 0), 450, 6)
area_light("CF_Rim", (2, 4, -6), (0, 3.0, 0), 900, 3, (0.75, 0.85, 1.0))
area_light("CF_Under", (0, -1, 5), (0, 2, 0), 250, 4, (0.6, 0.8, 1.0))

world = scene.world; world.use_nodes = True
bg = world.node_tree.nodes.get("Background")
bg.inputs[0].default_value = (0.78, 0.81, 0.85, 1); bg.inputs[1].default_value = 0.55
scene.render.engine = 'BLENDER_EEVEE'
try: scene.eevee.use_raytracing = True
except Exception: pass

result = {"objects": [o.name for o in parts], "verts_body": len(body_me.vertices), "spine_len": round(_arc[-1], 2)}

# ------------------------------------------------------------------ look: bloom + colour management
scene.view_settings.view_transform = 'AgX'
try: scene.view_settings.look = 'AgX - Medium High Contrast'
except Exception: pass
scene.view_settings.exposure = -0.1
try:
    scene.render.use_compositing = True
    ng = getattr(scene, "compositing_node_group", None)
    if ng is None:
        ng = bpy.data.node_groups.get("CF_Comp") or bpy.data.node_groups.new("CF_Comp", 'CompositorNodeTree')
        scene.compositing_node_group = ng
    ng.nodes.clear()
    if not any(s.in_out == 'OUTPUT' for s in ng.interface.items_tree if hasattr(s, "in_out")):
        ng.interface.new_socket("Image", in_out='OUTPUT', socket_type='NodeSocketColor')
    rl = ng.nodes.new("CompositorNodeRLayers")
    gl = ng.nodes.new("CompositorNodeGlare")
    go = ng.nodes.new("NodeGroupOutput")
    ng.links.new(rl.outputs["Image"], gl.inputs["Image"]); ng.links.new(gl.outputs["Image"], go.inputs[0])
    if hasattr(gl, "glare_type"): gl.glare_type = 'BLOOM'
    else:
        for val in ('BLOOM', 'Bloom'):
            try: gl.inputs["Type"].default_value = val; break
            except Exception: pass
    for nm, val in (("Threshold", 1.6), ("Strength", 0.12), ("Size", 6), ("Smoothness", 0.3)):
        if nm in gl.inputs:
            try: gl.inputs[nm].default_value = val
            except Exception: pass
    result["bloom"] = "ok type=%s" % gl.inputs["Type"].default_value
except Exception as e:
    scene.render.use_compositing = False
    result["bloom"] = repr(e)

# DeKoi product scene: Kjell Raspberry Pi 4 case (black) with the backlit CyberFish mark on the lid,
# and a Raspberry Pi 4 Model B with a pin-fin heatsink inside. Units: 1 BU = 1 cm.
# Everything this script owns is prefixed DK_. Run inside Blender:
#   exec(open("/abs/path/build_dekoi.py").read())
import bpy, bmesh, math, random, re
from mathutils import Vector, Matrix, Euler

P = "DK_"
ACCENT = (0.027, 0.392, 1.0)          # #2EA8FF in linear RGB
random.seed(7)

# ------------------------------------------------------------------ scene + cleanup
sc = bpy.data.scenes.get("DeKoi") or bpy.data.scenes.new("DeKoi")
for w in bpy.context.window_manager.windows:
    w.scene = sc
for o in list(bpy.data.objects):
    if o.name.startswith(P):
        bpy.data.objects.remove(o, do_unlink=True)
for c in list(bpy.data.collections):
    if c.name.startswith(P):
        bpy.data.collections.remove(c)
for coll in (bpy.data.meshes, bpy.data.curves, bpy.data.lights, bpy.data.cameras, bpy.data.materials):
    for d in list(coll):
        if d.name.startswith(P) and d.users == 0:
            coll.remove(d)
sc.unit_settings.system = 'METRIC'
sc.unit_settings.scale_length = 0.01
sc.unit_settings.length_unit = 'CENTIMETERS'

def new_coll(name):
    c = bpy.data.collections.new(P + name); sc.collection.children.link(c); return c
C_CASE, C_PI, C_STAGE, C_CUT = new_coll("Case"), new_coll("Pi"), new_coll("Stage"), new_coll("Cutters")

# ------------------------------------------------------------------ materials
def mat(name, base, rough=0.5, metal=0.0, coat=0.0, emit=None, estr=0.0, bump=0.0, bump_scale=60.0):
    m = bpy.data.materials.get(P + name) or bpy.data.materials.new(P + name)
    try: m.use_nodes = True
    except Exception: pass
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial"); bs = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bs.outputs[0], out.inputs[0])
    bs.inputs["Base Color"].default_value = (*base, 1)
    bs.inputs["Roughness"].default_value = rough
    bs.inputs["Metallic"].default_value = metal
    bs.inputs["Coat Weight"].default_value = coat
    if emit:
        bs.inputs["Emission Color"].default_value = (*emit, 1)
        bs.inputs["Emission Strength"].default_value = estr
    if bump > 0:
        tc = nt.nodes.new("ShaderNodeTexCoord"); nz = nt.nodes.new("ShaderNodeTexNoise"); bp = nt.nodes.new("ShaderNodeBump")
        nz.inputs["Scale"].default_value = bump_scale; nz.inputs["Detail"].default_value = 8
        bp.inputs["Strength"].default_value = bump; bp.inputs["Distance"].default_value = 0.004
        nt.links.new(tc.outputs["Object"], nz.inputs["Vector"]); nt.links.new(nz.outputs["Fac"], bp.inputs["Height"])
        nt.links.new(bp.outputs["Normal"], bs.inputs["Normal"])
    return m

M = {
    "case":   mat("CasePlastic", (0.010, 0.010, 0.012), rough=0.48, bump=0.12),
    "lid":    mat("LidPlastic", (0.008, 0.008, 0.010), rough=0.30, coat=0.15, bump=0.05),
    "logo":   mat("LogoGlow", (0.9, 0.95, 1.0), rough=0.4, emit=(0.86, 0.93, 1.0), estr=14.0),
    "frame":  mat("FrameGlow", (0.8, 0.85, 0.9), rough=0.4, emit=(0.80, 0.88, 1.0), estr=2.2),
    "gold":   mat("Gold", (1.0, 0.72, 0.34), rough=0.25, metal=1.0),
    "sink":   mat("HeatsinkAnodized", (1.0, 0.50, 0.12), rough=0.32, metal=1.0),
    "silver": mat("Silver", (0.80, 0.80, 0.82), rough=0.22, metal=1.0),
    "brushed":mat("BrushedShield", (0.72, 0.73, 0.75), rough=0.38, metal=1.0, bump=0.05, bump_scale=300),
    "black":  mat("BlackPlastic", (0.012, 0.012, 0.012), rough=0.45),
    "hole":   mat("PortHole", (0.0, 0.0, 0.0), rough=0.9),
    "usb3":   mat("USB3Blue", (0.0, 0.10, 0.75), rough=0.4),
    "usb2":   mat("USB2Black", (0.02, 0.02, 0.022), rough=0.4),
    "tan":    mat("LatchTan", (0.55, 0.38, 0.18), rough=0.5),
    "ic":     mat("ICPackage", (0.018, 0.018, 0.02), rough=0.35),
    "capt":   mat("CapTan", (0.45, 0.32, 0.18), rough=0.4),
    "capb":   mat("CapBrown", (0.22, 0.13, 0.07), rough=0.4),
    "silk":   mat("Silkscreen", (0.85, 0.85, 0.82), rough=0.6),
    "ledr":   mat("LEDRed", (1.0, 0.05, 0.02), rough=0.2, emit=(1.0, 0.03, 0.01), estr=60.0),
    "ledg":   mat("LEDGreen", (0.05, 1.0, 0.1), rough=0.2, emit=(0.05, 1.0, 0.15), estr=4.0),
    "leda":   mat("LEDAmber", (1.0, 0.5, 0.05), rough=0.2, emit=(1.0, 0.45, 0.03), estr=6.0),
    "sd":     mat("SDCard", (0.02, 0.03, 0.06), rough=0.5),
    "stage":  mat("Stage", (0.0025, 0.004, 0.010), rough=0.30),
}

# PCB: glossy solder mask with lighter, Manhattan-Voronoi "traces" under it
pcb = bpy.data.materials.get(P + "PCB") or bpy.data.materials.new(P + "PCB")
try: pcb.use_nodes = True
except Exception: pass
nt = pcb.node_tree; nt.nodes.clear()
out = nt.nodes.new("ShaderNodeOutputMaterial"); bs = nt.nodes.new("ShaderNodeBsdfPrincipled")
tc = nt.nodes.new("ShaderNodeTexCoord"); vo = nt.nodes.new("ShaderNodeTexVoronoi")
vo.feature = 'DISTANCE_TO_EDGE'; vo.distance = 'MANHATTAN'; vo.inputs["Scale"].default_value = 9.0
mr = nt.nodes.new("ShaderNodeMapRange"); mr.inputs["From Min"].default_value = 0.0; mr.inputs["From Max"].default_value = 0.025
mr.inputs["To Min"].default_value = 1.0; mr.inputs["To Max"].default_value = 0.0; mr.clamp = True
mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = 'RGBA'
mix.inputs[6].default_value = (0.010, 0.11, 0.035, 1); mix.inputs[7].default_value = (0.03, 0.22, 0.07, 1)
bp = nt.nodes.new("ShaderNodeBump"); bp.inputs["Strength"].default_value = 0.25; bp.inputs["Distance"].default_value = 0.002
nt.links.new(tc.outputs["Object"], vo.inputs["Vector"]); nt.links.new(vo.outputs["Distance"], mr.inputs["Value"])
nt.links.new(mr.outputs["Result"], mix.inputs[0]); nt.links.new(mix.outputs[2], bs.inputs["Base Color"])
nt.links.new(mr.outputs["Result"], bp.inputs["Height"]); nt.links.new(bp.outputs["Normal"], bs.inputs["Normal"])
bs.inputs["Roughness"].default_value = 0.32; bs.inputs["Coat Weight"].default_value = 0.6; bs.inputs["Coat Roughness"].default_value = 0.08
nt.links.new(bs.outputs[0], out.inputs[0])
M["pcb"] = pcb

# ------------------------------------------------------------------ geometry helpers
def rrect(w, h, r, seg=10, cx=0.0, cy=0.0):
    pts = []
    for (qx, qy, a0) in ((w/2 - r, h/2 - r, 0), (-w/2 + r, h/2 - r, 90), (-w/2 + r, -h/2 + r, 180), (w/2 - r, -h/2 + r, 270)):
        for i in range(seg + 1):
            a = math.radians(a0 + 90 * i / seg)
            pts.append((cx + qx + r * math.cos(a), cy + qy + r * math.sin(a)))
    return pts

def prism(bm, pts, z0, z1, top=True, bot=True):
    b = [bm.verts.new((x, y, z0)) for x, y in pts]; t = [bm.verts.new((x, y, z1)) for x, y in pts]
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n; bm.faces.new((b[i], b[j], t[j], t[i]))
    if bot: bm.faces.new(list(reversed(b)))
    if top: bm.faces.new(t)

def cube(bm, x0, x1, y0, y1, z0, z1):
    bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.LocRotScale(
        Vector(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)), None, Vector((x1 - x0, y1 - y0, z1 - z0))))

def cyl(bm, loc, r, depth, rot=None, seg=32):
    m = Matrix.Translation(Vector(loc)) @ (rot.to_matrix().to_4x4() if rot else Matrix.Identity(4))
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r, radius2=r, depth=depth, matrix=m)

def mk(name, bm, material, coll, parent=None, smooth=False):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(P + name); bm.to_mesh(me); bm.free()
    if material: me.materials.append(material)
    if smooth:
        for p in me.polygons: p.use_smooth = True
    o = bpy.data.objects.new(P + name, me); coll.objects.link(o)
    if parent: o.parent = parent
    return o

def bevel(o, width, seg=3, angle=40):
    b = o.modifiers.new("Bevel", 'BEVEL'); b.width = width; b.segments = seg
    b.limit_method = 'ANGLE'; b.angle_limit = math.radians(angle); b.use_clamp_overlap = True
    return b

def bake(o):
    vl = sc.view_layers[0]; vl.update()
    eo = o.evaluated_get(vl.depsgraph)
    me = bpy.data.meshes.new_from_object(eo)
    old = o.data; name = old.name
    o.modifiers.clear(); o.data = me
    bpy.data.meshes.remove(old); me.name = name

def finish_smooth(o, angle=40):
    me = o.data
    for p in me.polygons: p.use_smooth = True
    me.set_sharp_from_angle(angle=math.radians(angle))
    wn = o.modifiers.new("WeightedNormal", 'WEIGHTED_NORMAL'); wn.keep_sharp = True

# ------------------------------------------------------------------ case body
OW, OD, R = 9.4, 6.4, 0.6
WALL, FLOOR, BODY_H, LID_T = 0.2, 0.2, 2.75, 0.25
BOARD_X0, BOARD_Y0, BOARD_TOP = -4.35, -2.8, 0.64       # world position of Pi board origin (lower-left, top surface)
def wx(x): return BOARD_X0 + x / 10
def wy(y): return BOARD_Y0 + y / 10
def wz(z): return BOARD_TOP + z / 10

bm = bmesh.new(); prism(bm, rrect(OW, OD, R), 0.0, BODY_H)
body = mk("CaseBody", bm, M["case"], C_CASE)

def cutter(name, build):
    bm = bmesh.new(); build(bm); return mk("Cut_" + name, bm, None, C_CUT)

def slot_y_obj(name, cx, cz, w, h, r, y0, y1):
    b = bmesh.new()
    prism(b, rrect(w, h, r, seg=6), y0, y1)          # built along z, then rotated so z -> y
    bmesh.ops.transform(b, matrix=Matrix.Rotation(math.radians(-90), 4, 'X'), verts=b.verts)
    bmesh.ops.translate(b, vec=Vector((cx, 0, cz)), verts=b.verts)
    return mk("Cut_" + name, b, None, C_CUT)

def slot_x_obj(name, cy, cz, w, h, r, x0, x1):
    b = bmesh.new()
    prism(b, rrect(w, h, r, seg=6), x0, x1)          # built along z, then rotated so z -> x
    bmesh.ops.transform(b, matrix=Matrix.Rotation(math.radians(90), 4, 'Y') @ Matrix.Rotation(math.radians(90), 4, 'Z'), verts=b.verts)
    bmesh.ops.translate(b, vec=Vector((0, cy, cz)), verts=b.verts)
    return mk("Cut_" + name, b, None, C_CUT)

cutter("Cavity", lambda b: prism(b, rrect(OW - 2 * WALL, OD - 2 * WALL, R - WALL), FLOOR, BODY_H + 1.0))
PAD = 0.06
# +X short wall: Ethernet, USB3 pair, USB2 pair
for nm, y0, y1, z1 in (("Eth", 37.75, 53.75, 13.5), ("USB3", 20.4, 33.6, 15.6), ("USB2", 2.4, 15.6, 15.6)):
    h = wz(z1) - wz(0) + 2 * PAD; w = wy(y1) - wy(y0) + 2 * PAD
    slot_x_obj(nm, (wy(y0) + wy(y1)) / 2, (wz(0) + wz(z1)) / 2, w, h, 0.08, 4.3, 5.2)
# -Y long wall: USB-C, micro HDMI x2, audio
slot_y_obj("USBC", wx(11.2), wz(1.6), 0.9 + 2 * PAD + 0.04, 0.32 + 2 * PAD + 0.04, 0.17, -3.6, -2.9)
slot_y_obj("HDMI0", wx(26.0), wz(1.5), 0.65 + 2 * PAD + 0.04, 0.30 + 2 * PAD + 0.04, 0.08, -3.6, -2.9)
slot_y_obj("HDMI1", wx(39.5), wz(1.5), 0.65 + 2 * PAD + 0.04, 0.30 + 2 * PAD + 0.04, 0.08, -3.6, -2.9)
cutter("Audio", lambda b: cyl(b, (wx(53.5), -3.2, wz(3.0)), 0.4, 1.0, rot=Euler((math.radians(90), 0, 0))))
# -X short wall: microSD slot
slot_x_obj("SD", 0.0, 0.42, 1.7, 0.22, 0.08, -5.2, -4.3)
# lid clip recesses on the inner rim
for sx in (-3.1, 3.1):
    for (y0, y1) in ((-3.12, -2.9), (2.9, 3.12)):
        cutter("Clip", lambda b, sx=sx, y0=y0, y1=y1: cube(b, sx - 0.35, sx + 0.35, y0, y1, BODY_H - 0.2, BODY_H + 0.5))

bo = body.modifiers.new("Cut", 'BOOLEAN'); bo.operation = 'DIFFERENCE'; bo.operand_type = 'COLLECTION'
bo.collection = C_CUT; bo.solver = 'EXACT'
bake(body)
bevel(body, 0.03, seg=3, angle=40); bake(body)
finish_smooth(body)

for o in list(C_CUT.objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.data.collections.remove(C_CUT)

# standoffs under the four mounting holes
bm = bmesh.new()
for hx, hy in ((3.5, 3.5), (61.5, 3.5), (3.5, 52.5), (61.5, 52.5)):
    cyl(bm, (wx(hx), wy(hy), (FLOOR + 0.5) / 2), 0.28, 0.5 - FLOOR + 0.02, seg=24)
    cyl(bm, (wx(hx), wy(hy), 0.5 + 0.11), 0.12, 0.22, seg=20)         # peg through the board
mk("Standoffs", bm, M["case"], C_CASE, smooth=True)

# ------------------------------------------------------------------ lid (parented to an animated rig)
lid_rig = bpy.data.objects.new(P + "LidRig", None); C_CASE.objects.link(lid_rig)
lid_rig.empty_display_type = 'ARROWS'; lid_rig.empty_display_size = 2
lid_rig.location = (0, 0, BODY_H)

bm = bmesh.new(); prism(bm, rrect(OW, OD, R), 0.0, LID_T)
prism(bm, rrect(OW - 2 * WALL - 0.04, OD - 2 * WALL - 0.04, R - WALL), -0.16, 0.01, top=False)
lid = mk("Lid", bm, M["lid"], C_CASE, parent=lid_rig)
bevel(lid, 0.03, seg=3, angle=40); bake(lid); finish_smooth(lid)

# inset frame line
bm = bmesh.new()
po, pi_ = rrect(8.42, 5.42, 0.36), rrect(8.28, 5.28, 0.29)
zf = LID_T + 0.0015
vo_ = [bm.verts.new((x, y, zf)) for x, y in po]; vi_ = [bm.verts.new((x, y, zf)) for x, y in pi_]
for i in range(len(po)):
    j = (i + 1) % len(po); bm.faces.new((vo_[i], vo_[j], vi_[j], vi_[i]))
mk("LidFrame", bm, M["frame"], C_CASE, parent=lid_rig)

# CyberFish mark (from public/cyberfish-mark.svg), rows of chevrons run along the lid's long axis
MARK = ("M70 -49V-185L346 -306Q366 -315 388.0 -321.0Q410 -327 423 -329Q410 -331 388.0 -336.5Q366 -342 346 -351L70 -472V-609L530 -401V-258Z "
        "M1070.0 -49 610.0 -257V-400L1070.0 -609V-473L794.0 -352Q774.0 -343 752.0 -337.0Q730.0 -331 717.0 -329Q730.0 -327 752.0 -321.5Q774.0 -316 794.0 -307L1070.0 -186Z "
        "M1150.0 -49V-185L1426.0 -306Q1446.0 -315 1468.0 -321.0Q1490.0 -327 1503.0 -329Q1490.0 -331 1468.0 -336.5Q1446.0 -342 1426.0 -351L1150.0 -472V-609L1610.0 -401V-258Z")

def parse_path(d, qsteps=8):
    toks = re.findall(r'[MLHVQZ]|-?\d*\.?\d+', d)
    polys, cur, i, cmd, x, y = [], [], 0, None, 0.0, 0.0
    def num():
        nonlocal i
        v = float(toks[i]); i += 1; return v
    while i < len(toks):
        t = toks[i]
        if t in "MLHVQZ":
            cmd = t; i += 1
            if cmd == 'Z':
                polys.append(cur); cur = []
                continue
        if cmd == 'M':
            x, y = num(), num()
            if cur: polys.append(cur)
            cur = [(x, y)]; cmd = 'L'
        elif cmd == 'L':
            x, y = num(), num(); cur.append((x, y))
        elif cmd == 'H':
            x = num(); cur.append((x, y))
        elif cmd == 'V':
            y = num(); cur.append((x, y))
        elif cmd == 'Q':
            qx, qy, ex, ey = num(), num(), num(), num()
            for k in range(1, qsteps + 1):
                s = k / qsteps
                cur.append(((1 - s) ** 2 * x + 2 * (1 - s) * s * qx + s * s * ex, (1 - s) ** 2 * y + 2 * (1 - s) * s * qy + s * s * ey))
            x, y = ex, ey
    if cur: polys.append(cur)
    out = []
    for p in polys:
        if len(p) > 2 and abs(p[0][0] - p[-1][0]) < 1e-6 and abs(p[0][1] - p[-1][1]) < 1e-6: p = p[:-1]
        if len(p) > 2: out.append(p)
    return out

LOGO_LEN = 5.4
s = LOGO_LEN / 1540.0
bm = bmesh.new()
for poly in parse_path(MARK):
    vs = [bm.verts.new(((px - 840.0) * s, -(py + 329.0) * s, LID_T + 0.002)) for px, py in poly]
    f = bm.faces.new(vs)
bmesh.ops.triangulate(bm, faces=bm.faces[:], quad_method='BEAUTY', ngon_method='EAR_CLIP')
for f in bm.faces:
    if f.normal.z < 0: f.normal_flip()
mk("LogoMark", bm, M["logo"], C_CASE, parent=lid_rig)

# ------------------------------------------------------------------ Raspberry Pi 4 Model B (board space in mm, origin = lower-left of top surface)
pi_root = bpy.data.objects.new(P + "Pi4", None); C_PI.objects.link(pi_root)
pi_root.location = (BOARD_X0, BOARD_Y0, BOARD_TOP); pi_root.empty_display_size = 1
PB = {}
def pb(k):
    if k not in PB: PB[k] = bmesh.new()
    return PB[k]
def box(k, x0, x1, y0, y1, z0, z1):
    cube(pb(k), x0 / 10, x1 / 10, y0 / 10, y1 / 10, z0 / 10, z1 / 10)
def cylz(k, x, y, z0, z1, r, seg=24):
    cyl(pb(k), (x / 10, y / 10, (z0 + z1) / 20), r / 10, (z1 - z0) / 10, seg=seg)
def cyly(k, x, z, y0, y1, r, seg=24):
    cyl(pb(k), (x / 10, (y0 + y1) / 20, z / 10), r / 10, abs(y1 - y0) / 10, rot=Euler((math.radians(90), 0, 0)), seg=seg)

# board
bm = bmesh.new(); prism(bm, rrect(8.5, 5.6, 0.3, cx=4.25, cy=2.8), -0.14, 0.0)
board = mk("PCB", bm, M["pcb"], C_PI, parent=pi_root)
# mounting hole pads + holes
for hx, hy in ((3.5, 3.5), (61.5, 3.5), (3.5, 52.5), (61.5, 52.5)):
    cylz("gold", hx, hy, 0.0, 0.03, 3.0, seg=32)
    cylz("hole", hx, hy, 0.03, 0.05, 1.35, seg=32)

# GPIO header 2x20
box("black", 7.1, 57.9, 50.0, 55.0, 0.0, 2.5)
for i in range(20):
    for j in range(2):
        px = 32.5 + (i - 9.5) * 2.54; py = 52.5 + (j - 0.5) * 2.54
        box("gold", px - 0.32, px + 0.32, py - 0.32, py + 0.32, 2.4, 8.5)
# PoE header 2x2
box("black", 59.0, 64.0, 44.5, 49.5, 0.0, 2.5)
for i in range(2):
    for j in range(2):
        px = 60.25 + i * 2.54; py = 45.75 + j * 2.54
        box("gold", px - 0.32, px + 0.32, py - 0.32, py + 0.32, 2.4, 8.5)

# Ethernet RJ45
box("brushed", 66.0, 87.5, 37.75, 53.75, 0.0, 13.5)
box("hole", 87.5, 87.6, 39.6, 51.9, 1.6, 10.2)
box("hole", 87.5, 87.6, 43.2, 48.3, 10.2, 11.6)                      # latch notch
box("ledg", 87.5, 87.62, 38.6, 40.4, 11.4, 12.6); box("leda", 87.5, 87.62, 51.1, 52.9, 11.4, 12.6)
# USB stacks (USB3 blue middle, USB2 black near edge)
for (yc, tongue) in ((27.0, "usb3"), (9.0, "usb2")):
    y0, y1 = yc - 6.6, yc + 6.6
    box("silver", 70.0, 87.5, y0, y1, 0.0, 15.6)
    for (oz0, oz1) in ((1.8, 6.9), (9.0, 14.1)):
        box("hole", 87.5, 87.6, y0 + 0.6, y1 - 0.6, oz0, oz1)
        box(tongue, 80.0, 87.62, y0 + 1.8, y1 - 1.8, oz1 - 2.3, oz1 - 0.6)
# USB-C power
box("silver", 6.7, 15.7, -1.3, 6.2, 0.0, 3.2)
box("hole", 7.5, 14.9, -1.4, -1.3, 0.5, 2.7); box("usb2", 8.6, 13.8, -1.45, 5.0, 1.3, 1.9)
# micro HDMI x2
for xc in (26.0, 39.5):
    box("silver", xc - 3.25, xc + 3.25, -1.0, 6.5, 0.0, 3.0)
    box("hole", xc - 2.7, xc + 2.7, -1.1, -1.0, 0.4, 2.6); box("usb2", xc - 2.0, xc + 2.0, -1.15, 5.0, 1.2, 1.8)
# audio jack
box("black", 50.5, 56.5, 0.0, 12.0, 0.0, 6.0)
cyly("black", 53.5, 3.0, -2.5, 0.2, 3.0); cyly("hole", 53.5, 3.0, -2.6, -2.4, 1.75)
# camera + display FPC connectors
box("black", 45.0, 48.5, 1.0, 22.5, 0.0, 2.6); box("tan", 45.3, 48.2, 1.2, 22.3, 2.6, 3.1)
box("black", 1.2, 4.7, 16.0, 38.0, 0.0, 2.6); box("tan", 1.5, 4.4, 16.2, 37.8, 2.6, 3.1)
# wireless module shield
box("brushed", 6.5, 16.5, 36.5, 48.0, 0.0, 1.6)
# SoC + heatsink
box("silver", 23.5, 38.5, 22.5, 37.5, 0.0, 1.3)
box("ic", 22.0, 40.0, 21.0, 39.0, 0.0, 0.6)
HS_X0, HS_X1, HS_Y0, HS_Y1, N = 18.0, 44.0, 17.0, 43.0, 9
box("sink", HS_X0, HS_X1, HS_Y0, HS_Y1, 1.6, 3.6)
pitch = (HS_X1 - HS_X0) / N; pin = pitch * 0.62
for i in range(N):
    for j in range(N):
        cx = HS_X0 + pitch * (i + 0.5); cy = HS_Y0 + pitch * (j + 0.5)
        box("sink", cx - pin / 2, cx + pin / 2, cy - pin / 2, cy + pin / 2, 3.5, 13.6)
# RAM, USB controller, PHY, PMIC
box("ic", 47.0, 58.0, 29.0, 41.0, 0.0, 1.0)
box("ic", 57.5, 64.5, 17.0, 24.0, 0.0, 0.9)
box("ic", 58.5, 64.0, 37.0, 42.5, 0.0, 0.8)
box("ic", 8.0, 13.0, 8.0, 13.0, 0.0, 0.8)
box("silver", 20.0, 23.2, 12.0, 14.0, 0.0, 0.8)                     # crystal
# status LEDs (PWR red lit, ACT green dim)
box("ledr", 1.4, 3.2, 8.6, 9.6, 0.0, 0.6); box("ledg", 1.4, 3.2, 11.0, 12.0, 0.0, 0.6)
# microSD (underside, peeks out the -X slot)
box("silver", 1.0, 15.0, 21.0, 35.0, -2.8, -1.4); box("sd", -2.5, 13.0, 22.5, 33.5, -2.6, -1.9)

# scatter passives on the free board area
RESERVED = [(0, 17, 0, 7.5), (21.5, 31, -1, 7.5), (35, 44.5, -1, 7.5), (45, 57, -3, 22.5), (0, 5, 15, 39), (6, 17, 36, 48.5),
            (17.5, 44.5, 16.5, 43.5), (46.5, 58.5, 28.5, 41.5), (57, 65, 16.5, 24.5), (58, 65, 36.5, 50), (6.5, 59, 49.5, 56),
            (65.5, 88, 0, 56), (7.5, 13.5, 7.5, 13.5), (0, 4, 8, 13), (19.5, 23.5, 11.5, 14.5), (0, 7, 0, 7), (58, 65, 0, 7),
            (0, 7, 49, 56), (58, 65, 49, 56), (19, 45, 44.5, 48.5)]
def free(x0, x1, y0, y1):
    if x0 < 1 or x1 > 84 or y0 < 1 or y1 > 55: return False
    return not any(x0 < r[1] and x1 > r[0] and y0 < r[3] and y1 > r[2] for r in RESERVED)
KINDS = [("capt", 1.0, 0.5, 0.5, 5), ("capb", 1.6, 0.8, 0.8, 3), ("ic", 1.6, 0.8, 0.45, 4), ("ic", 3.0, 3.0, 0.8, 1),
         ("ic", 2.0, 1.2, 0.6, 2), ("silver", 1.2, 0.6, 0.4, 1)]
pool = [k for k in KINDS for _ in range(k[4])]
placed = 0
for _ in range(4000):
    if placed >= 170: break
    k, w, h, t, _w = random.choice(pool)
    if random.random() < 0.5: w, h = h, w
    x = random.uniform(1, 84); y = random.uniform(1, 55)
    x0, x1, y0, y1 = x, x + w, y, y + h
    if not free(x0 - 0.3, x1 + 0.3, y0 - 0.3, y1 + 0.3): continue
    box(k, x0, x1, y0, y1, 0.0, t)
    if k in ("capt", "capb"):                                       # solder ends
        e = min(w, h) * 0.25
        if w > h: box("silver", x0 - 0.02, x0 + e, y0 - 0.02, y1 + 0.02, 0.0, t + 0.02); box("silver", x1 - e, x1 + 0.02, y0 - 0.02, y1 + 0.02, 0.0, t + 0.02)
        else: box("silver", x0 - 0.02, x1 + 0.02, y0 - 0.02, y0 + e, 0.0, t + 0.02); box("silver", x0 - 0.02, x1 + 0.02, y1 - e, y1 + 0.02, 0.0, t + 0.02)
    RESERVED.append((x0 - 0.2, x1 + 0.2, y0 - 0.2, y1 + 0.2)); placed += 1

for k, b in PB.items():
    o = mk("Pi_" + k, b, M[k], C_PI, parent=pi_root)
    if k in ("silver", "brushed", "sink", "black", "usb3", "usb2", "ic", "sd"):
        bv = bevel(o, 0.008, seg=2, angle=50)

# silkscreen
cu = bpy.data.curves.new(P + "Silk", 'FONT'); cu.body = "Raspberry Pi 4 Model B"; cu.size = 0.15
tx = bpy.data.objects.new(P + "Silk", cu); C_PI.objects.link(tx); tx.parent = pi_root
tx.location = (2.0, 4.52, 0.003); cu.materials.append(M["silk"])
cu2 = bpy.data.curves.new(P + "Silk2", 'FONT'); cu2.body = "© Raspberry Pi 2018"; cu2.size = 0.11
tx2 = bpy.data.objects.new(P + "Silk2", cu2); C_PI.objects.link(tx2); tx2.parent = pi_root
tx2.location = (6.6, 0.2, 0.003); tx2.rotation_euler = (0, 0, math.radians(90)); cu2.materials.append(M["silk"])

# ------------------------------------------------------------------ stage (cyclorama)
bm = bmesh.new()
prof = [(-250.0, 0.0)] + [(60 + 45 * math.sin(math.radians(a)), 45 - 45 * math.cos(math.radians(a))) for a in range(0, 91, 5)] + [(105.0, 300.0)]
rowL = [bm.verts.new((-300, y, z)) for y, z in prof]; rowR = [bm.verts.new((300, y, z)) for y, z in prof]
for i in range(len(prof) - 1):
    bm.faces.new((rowL[i], rowR[i], rowR[i + 1], rowL[i + 1]))
stage = mk("Cyclorama", bm, M["stage"], C_STAGE, smooth=True)

# world
world = bpy.data.worlds.get(P + "World") or bpy.data.worlds.new(P + "World")
try: world.use_nodes = True
except Exception: pass
bgn = world.node_tree.nodes.get("Background")
bgn.inputs["Color"].default_value = (0.0015, 0.0025, 0.007, 1); bgn.inputs["Strength"].default_value = 1.0
sc.world = world

# ------------------------------------------------------------------ lights
def area(name, loc, target, size, size_y, power, color, spread=180):
    ld = bpy.data.lights.new(P + name, 'AREA'); ld.shape = 'RECTANGLE'; ld.size = size; ld.size_y = size_y
    ld.spread = math.radians(spread)
    ld.energy = power; ld.color = color
    o = bpy.data.objects.new(P + name, ld); C_STAGE.objects.link(o); o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    o.visible_camera = False
    return o
LIGHT_SCALE = 1.0
area("Key", (-30, -38, 48), (0, 0, 1), 40, 30, 70000 * LIGHT_SCALE, (0.93, 0.96, 1.0))
area("Top", (4, 6, 60), (0, 0, 0), 30, 14, 22000 * LIGHT_SCALE, (0.90, 0.94, 1.0))
area("RimBlue", (-30, 40, 22), (0, 0, 1.5), 30, 8, 700 * LIGHT_SCALE, ACCENT, spread=30)
area("RimCool", (40, 30, 24), (0, 0, 1.5), 24, 8, 4000 * LIGHT_SCALE, (0.55, 0.72, 1.0), spread=30)
area("BackWash", (0, 20, 70), (0, 75, 30), 80, 30, 6000 * LIGHT_SCALE, (0.10, 0.30, 1.0), spread=35)   # soft blue wash on the back wall

# ------------------------------------------------------------------ camera + animation (closed -> lid lifts off -> Pi revealed)
cam_t = bpy.data.objects.new(P + "CamTarget", None); C_STAGE.objects.link(cam_t)
cd = bpy.data.cameras.new(P + "Cam"); cam = bpy.data.objects.new(P + "Cam", cd); C_STAGE.objects.link(cam)
cd.lens = 85; cd.sensor_width = 36; cd.clip_start = 1.0; cd.clip_end = 2000
cd.dof.use_dof = True; cd.dof.focus_object = cam_t; cd.dof.aperture_fstop = 5.6
tr = cam.constraints.new('TRACK_TO'); tr.target = cam_t; tr.track_axis = 'TRACK_NEGATIVE_Z'; tr.up_axis = 'UP_Y'
sc.camera = cam

SHOTS = {
    "closed": dict(cam=(40, -40, 25), tgt=(0.4, -0.3, 1.2)),
    "open":   dict(cam=(40, -49, 44), tgt=(0.0, 1.2, 4.9)),
    "detail": dict(cam=(14, -17, 22), tgt=(0.3, 0.0, 1.0)),
}
LID_OPEN_LOC = (-0.6, 4.2, BODY_H + 6.0); LID_OPEN_ROT = (math.radians(38), math.radians(-6), math.radians(-7))
dt = bpy.data.objects.new(P + "DetailTarget", None); C_STAGE.objects.link(dt); dt.location = SHOTS["detail"]["tgt"]
dcd = bpy.data.cameras.new(P + "CamDetail"); dcam = bpy.data.objects.new(P + "CamDetail", dcd); C_STAGE.objects.link(dcam)
dcd.lens = 85; dcd.sensor_width = 36; dcd.clip_start = 1.0; dcd.dof.use_dof = True; dcd.dof.focus_object = dt; dcd.dof.aperture_fstop = 2.8
dcam.location = SHOTS["detail"]["cam"]
dtr = dcam.constraints.new('TRACK_TO'); dtr.target = dt; dtr.track_axis = 'TRACK_NEGATIVE_Z'; dtr.up_axis = 'UP_Y'
sc.frame_start, sc.frame_end = 1, 120; sc.render.fps = 30

for ob in (lid_rig, cam, cam_t):
    ob.animation_data_clear()
def key(ob, frame, loc=None, rot=None):
    if loc is not None: ob.location = loc; ob.keyframe_insert("location", frame=frame)
    if rot is not None: ob.rotation_euler = rot; ob.keyframe_insert("rotation_euler", frame=frame)
key(lid_rig, 1, (0, 0, BODY_H), (0, 0, 0)); key(lid_rig, 24, (0, 0, BODY_H), (0, 0, 0))
key(lid_rig, 34, (0, 0, BODY_H + 0.6), (0, 0, 0))
key(lid_rig, 84, LID_OPEN_LOC, LID_OPEN_ROT); key(lid_rig, 120, (LID_OPEN_LOC[0], LID_OPEN_LOC[1], LID_OPEN_LOC[2] + 0.4), LID_OPEN_ROT)
key(cam, 1, SHOTS["closed"]["cam"]); key(cam, 20, SHOTS["closed"]["cam"]); key(cam, 92, SHOTS["open"]["cam"])
key(cam, 120, (SHOTS["open"]["cam"][0] - 2, SHOTS["open"]["cam"][1] + 2, SHOTS["open"]["cam"][2] - 1))
key(cam_t, 1, SHOTS["closed"]["tgt"]); key(cam_t, 20, SHOTS["closed"]["tgt"]); key(cam_t, 92, SHOTS["open"]["tgt"]); key(cam_t, 120, SHOTS["open"]["tgt"])

# ------------------------------------------------------------------ render settings
sc.render.engine = 'CYCLES'
sc.cycles.device = 'GPU'
sc.cycles.samples = 256; sc.cycles.use_adaptive_sampling = True; sc.cycles.adaptive_threshold = 0.01
sc.cycles.use_denoising = True
sc.cycles.max_bounces = 8
sc.render.resolution_x = 1920; sc.render.resolution_y = 1080; sc.render.resolution_percentage = 100
sc.render.film_transparent = False
sc.view_settings.view_transform = 'AgX'
try: sc.view_settings.look = 'AgX - Medium High Contrast'
except Exception: pass
sc.view_settings.exposure = 0.0

try:
    sc.render.use_compositing = True
    ng = bpy.data.node_groups.get(P + "Comp") or bpy.data.node_groups.new(P + "Comp", 'CompositorNodeTree')
    sc.compositing_node_group = ng
    ng.nodes.clear()
    if not any(getattr(s_, "in_out", "") == 'OUTPUT' for s_ in ng.interface.items_tree):
        ng.interface.new_socket("Image", in_out='OUTPUT', socket_type='NodeSocketColor')
    rl = ng.nodes.new("CompositorNodeRLayers"); rl.scene = sc
    gl = ng.nodes.new("CompositorNodeGlare"); go = ng.nodes.new("NodeGroupOutput")
    ng.links.new(rl.outputs["Image"], gl.inputs["Image"]); ng.links.new(gl.outputs["Image"], go.inputs[0])
    for val in ('BLOOM', 'Bloom'):
        try: gl.inputs["Type"].default_value = val; break
        except Exception: pass
    for nm, val in (("Threshold", 1.2), ("Strength", 0.35), ("Size", 7), ("Smoothness", 0.5)):
        try: gl.inputs[nm].default_value = val
        except Exception: pass
except Exception as e:
    print("compositor skipped:", e)

# drop the factory-default scene of an untitled file
if not bpy.data.filepath:
    d = bpy.data.scenes.get("Scene")
    if d and d != sc:
        for o in list(d.collection.objects):
            if o.name in ("Cube", "Light", "Camera"): bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.scenes.remove(d)

sc.frame_set(1)
result = {"objects": len([o for o in bpy.data.objects if o.name.startswith(P)]), "passives": placed,
          "body_faces": len(body.data.polygons)}

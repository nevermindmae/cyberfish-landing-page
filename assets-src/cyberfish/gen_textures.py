"""Procedural PBR textures for the CyberFish (run inside Blender: needs numpy + bpy).

Body UV layout (from build_fish.py): u = angle around the body, u=0.5 is the
belly, u=0/1 the back; v = 0 at the nose, 1 at the tail peduncle.
Fin atlases: each fin owns a UV rect, u = across the rays, v = root -> edge.

Writes PNGs into OUT_DIR:  body_basecolor / body_orm / body_normal / body_emissive
                            fins_* and tail_* (same four maps)
ORM packing follows glTF: R = occlusion(1), G = roughness, B = metallic.
"""
import bpy, numpy as np, math, os

OUT_DIR = globals().get("OUT_DIR")
assert OUT_DIR, "set OUT_DIR before exec"
os.makedirs(OUT_DIR, exist_ok=True)
rng = np.random.default_rng(7)

def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)

def save_image(name, rgb, alpha=None, noncolor=False):
    H, W = rgb.shape[:2]
    rgba = np.empty((H, W, 4), np.float32)
    rgba[..., :3] = np.clip(rgb, 0, 1)
    rgba[..., 3] = 1.0 if alpha is None else np.clip(alpha, 0, 1)
    img = bpy.data.images.get(name)
    if img:                      # always rebuild: a packed image keeps stale pixels otherwise
        bpy.data.images.remove(img)
    img = bpy.data.images.new(name, W, H, alpha=True)
    img.colorspace_settings.name = 'Non-Color' if noncolor else 'sRGB'
    img.pixels.foreach_set(rgba.ravel())
    img.filepath_raw = os.path.join(OUT_DIR, name + ".png"); img.file_format = 'PNG'
    img.save()
    img.pack()
    return img

def normal_from_height(h, strength):
    """h in [0..1]-ish, pixel units. Returns tangent-space normal in [0,1] (OpenGL +Y)."""
    dx = np.zeros_like(h); dy = np.zeros_like(h)
    dx[:, 1:-1] = (h[:, 2:] - h[:, :-2]) * 0.5
    dy[1:-1, :] = (h[2:, :] - h[:-2, :]) * 0.5
    nx = -dx * strength; ny = -dy * strength; nz = np.ones_like(h)
    l = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack([nx / l, ny / l, nz / l], -1) * 0.5 + 0.5

def draw_segment(canvas, x0, y0, x1, y1, width, value=1.0):
    """Stamp a thick line into canvas (float), max-combined."""
    H, W = canvas.shape
    r = width * 0.5 + 1
    xa, xb = int(max(min(x0, x1) - r, 0)), int(min(max(x0, x1) + r, W - 1))
    ya, yb = int(max(min(y0, y1) - r, 0)), int(min(max(y0, y1) + r, H - 1))
    if xa >= xb or ya >= yb: return
    ys, xs = np.mgrid[ya:yb + 1, xa:xb + 1]
    vx, vy = x1 - x0, y1 - y0
    ll = vx * vx + vy * vy
    t = 0.0 if ll == 0 else np.clip(((xs - x0) * vx + (ys - y0) * vy) / ll, 0, 1)
    d = np.sqrt((xs - (x0 + t * vx)) ** 2 + (ys - (y0 + t * vy)) ** 2)
    a = np.clip(width * 0.5 + 0.5 - d, 0, 1) * value
    canvas[ya:yb + 1, xa:xb + 1] = np.maximum(canvas[ya:yb + 1, xa:xb + 1], a)

def draw_disc(canvas, cx, cy, rad, value=1.0, hole=0.0):
    H, W = canvas.shape
    xa, xb = int(max(cx - rad - 1, 0)), int(min(cx + rad + 1, W - 1))
    ya, yb = int(max(cy - rad - 1, 0)), int(min(cy + rad + 1, H - 1))
    if xa >= xb or ya >= yb: return
    ys, xs = np.mgrid[ya:yb + 1, xa:xb + 1]
    d = np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2)
    a = np.clip(rad + 0.5 - d, 0, 1)
    if hole > 0: a = a * np.clip(d - hole + 0.5, 0, 1)
    canvas[ya:yb + 1, xa:xb + 1] = np.maximum(canvas[ya:yb + 1, xa:xb + 1], a * value)

def draw_rect(canvas, cx, cy, w, h, value=1.0):
    H, W = canvas.shape
    xa, xb = int(max(cx - w / 2, 0)), int(min(cx + w / 2, W - 1))
    ya, yb = int(max(cy - h / 2, 0)), int(min(cy + h / 2, H - 1))
    if xa >= xb or ya >= yb: return
    canvas[ya:yb + 1, xa:xb + 1] = np.maximum(canvas[ya:yb + 1, xa:xb + 1], value)

# =========================================================== BODY
W = H = 2048
u = (np.arange(W) + 0.5) / W; v = (np.arange(H) + 0.5) / H
U, V_IMG = np.meshgrid(u, v)        # image coordinates, row 0 = bottom of the image
# UV layout (see build_fish.py): v < PLATE_H is the front-plate island; body rings use v = PLATE_H + (1-PLATE_H)*t
PLATE_H, PLATE_C, PLATE_R = 0.12, 0.06, 0.055
def img_v(t): return PLATE_H + (1 - PLATE_H) * t
V = np.clip((V_IMG - PLATE_H) / (1 - PLATE_H), 0, 1)   # body parameter t (0 nose .. 1 peduncle)
DU = np.abs(U - 0.5)                # 0 at belly .. 0.5 at back

# --- scales --------------------------------------------------------------
def scales(nu=38, v0=0.165, v1=0.985, dv=0.0215, Rfac=0.66):
    pu = 1.0 / nu; R = pu * Rfac
    h = np.zeros_like(U); sid = np.zeros_like(U); assigned = np.zeros(U.shape, bool)
    kbase = np.floor((V - v0) / dv)
    for ko in (-1, 0, 1, 2):
        k = kbase + ko
        vc = v0 + k * dv
        off = 0.5 * pu * np.mod(k, 2)
        uc = np.round((U - off) / pu) * pu + off
        d2 = (U - uc) ** 2 + (V - vc) ** 2
        cov = (d2 < R * R) & (vc >= v0) & (vc <= v1) & ~assigned
        ramp = np.clip((V - vc + R) / (2 * R), 0, 1)             # low under the previous plate, high at the free edge
        plate = 0.25 + 0.75 * ramp - 0.18 * ((U - uc) / R) ** 2   # convex across
        h = np.where(cov, plate, h)
        sid = np.where(cov, (k * 977 + np.round((uc - off) / pu) * 131) % 1000, sid)
        assigned |= cov
    return h, sid, assigned

sc_h, sc_id, sc_mask = scales()
sc_rand = ((sc_id * 2654435761) % 1000) / 1000.0            # per-scale pseudo random
sc_h = sc_h + (sc_rand - 0.5) * 0.08
# fade scales in behind the head, and shrink amplitude at the very tail
sc_amp = smoothstep(0.165, 0.21, V) * (1 - 0.5 * smoothstep(0.9, 1.0, V))
# scales are less pronounced on the belly
sc_amp = sc_amp * (0.45 + 0.55 * smoothstep(0.12, 0.3, DU))

# --- head panels / grooves ------------------------------------------------
def groove_v(vr, w):
    return np.exp(-((V - vr) / w) ** 2)
def groove_u(ur, w, va, vb):
    du = np.minimum(np.abs(U - ur), np.abs(U - ur - 1)); du = np.minimum(du, np.abs(U - ur + 1))
    return np.exp(-(du / w) ** 2) * smoothstep(va - 0.004, va, V) * (1 - smoothstep(vb, vb + 0.004, V))

def band_v(va, vb, soft=0.003):
    return smoothstep(va - soft, va, V) * (1 - smoothstep(vb, vb + soft, V))
def band_du(a, b, soft=0.004):
    return smoothstep(a - soft, a, DU) * (1 - smoothstep(b, b + soft, DU))

# armour plates: ring seams split the head into shingled segments, each a hair lower than the one in front
seams_v = (0.052, 0.102)
grooves = np.maximum(groove_v(0.160, 0.0028), groove_v(0.174, 0.0022))          # double gill ring
for sv in seams_v:
    grooves = np.maximum(grooves, groove_v(sv, 0.0026))
plate_step = sum(smoothstep(sv, sv + 0.004, V) for sv in seams_v) * 0.12
# crown ridge: a raised narrow strip along the top of the head with a status light down its centre
ridge = smoothstep(0.455, 0.465, DU) * band_v(0.018, 0.158, 0.003)
grooves = np.maximum(grooves, np.exp(-((DU - 0.46) / 0.0022) ** 2) * band_v(0.018, 0.158, 0.001))
status = np.exp(-((np.minimum(U, 1 - U)) / 0.0014) ** 2) * band_v(0.030, 0.150, 0.002)
# jaw / cheek panel splits (straight, along the body axis)
for ur in (0.26, 0.74):
    grooves = np.maximum(grooves, groove_u(ur, 0.0022, 0.03, 0.160))
grooves = np.maximum(grooves, groove_u(0.5, 0.0022, 0.03, 0.160))                 # chin seam
# mouth: a short straight slit on the underside of the snout — where a fish mouth is, not a face
grooves = np.maximum(grooves, np.exp(-((V - 0.020) / 0.0026) ** 2) * (1 - smoothstep(0.055, 0.075, DU)))

# eyes sit directly in the white shell: only a soft shadow seat right around each sphere (no dark pods)
pods = np.zeros_like(U)
for sgn in (-1, 1):
    seat = np.exp(-(((U - (0.5 + sgn * 0.33)) / 0.030) ** 2 + ((V - 0.072) / 0.028) ** 2))
    pods = np.maximum(pods, seat)
ports = np.zeros_like(U)
face = pods            # kept name: used below for recess / metal
head_mask = 1 - smoothstep(0.16, 0.2, V)

# --- circuit traces (belly): PCB-style router on a lattice, no crossings, 1-cell clearance ---
belly = smoothstep(0.38, 0.18, DU) * smoothstep(0.22, 0.50, V)            # 1 on the belly, fades up the sides
traces = np.zeros((H, W), np.float32); pads = np.zeros((H, W), np.float32); chips = np.zeros((H, W), np.float32)
CELL = 14
GW, GH = W // CELL, H // CELL
occ = np.zeros((GH, GW), bool)                       # occupied lattice cells (traces, pads, chips)
# routable region: belly, in lattice coords
cu0, cu1 = int(0.5 * GW - 0.29 * GW), int(0.5 * GW + 0.29 * GW)
cv0, cv1 = int(img_v(0.24) * GH), int(img_v(0.965) * GH)
def px(c): return (c + 0.5) * CELL
def free(cx, cy, margin=1):
    if cx < cu0 or cx > cu1 or cy < cv0 or cy > cv1: return False
    return not occ[max(cy - margin, 0):cy + margin + 1, max(cx - margin, 0):cx + margin + 1].any()
DIRS = [(0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1), (-1, 0), (-1, 1)]   # index i, 45deg steps
def route(cx, cy, di, max_len, path):
    """Walk from (cx,cy) heading DIRS[di]; prefer straight, bend 45deg occasionally; stop when blocked."""
    runs = 0
    while len(path) < max_len:
        # candidate headings: straight first, then +-45 (random order)
        cands = [di] + ([(di + 1) % 8, (di - 1) % 8] if rng.random() < 0.6 else [(di - 1) % 8, (di + 1) % 8])
        if runs < 3: cands = [di] + cands[1:] if rng.random() < 0.08 else [di]   # hold straight for a few cells
        moved = False
        for d in cands:
            dx, dy = DIRS[d]
            nx, ny = cx + dx, cy + dy
            if (nx, ny) in path or not free(nx, ny): continue
            # diagonal steps must not squeeze between two occupied cells
            if dx and dy and (occ[cy, nx] or occ[ny, cx]): continue
            cx, cy, di = nx, ny, d; path.append((cx, cy)); moved = True
            runs = runs + 1 if d == cands[0] else 0
            break
        if not moved: break
    return path

def commit(path, via_start=True, via_end=True):
    for (cx, cy) in path: occ[cy, cx] = True
    for (a, b) in zip(path[:-1], path[1:]):
        draw_segment(traces, px(a[0]), px(a[1]), px(b[0]), px(b[1]), 4.2)
    if via_start: draw_disc(pads, px(path[0][0]), px(path[0][1]), 6.5, 1.0, hole=2.6)
    if via_end:
        if rng.random() < 0.6: draw_disc(pads, px(path[-1][0]), px(path[-1][1]), 6.5, 1.0, hole=2.6)
        else: draw_rect(pads, px(path[-1][0]), px(path[-1][1]), 11, 11, 1.0)

# 1) chips first: small rectangles with pins; traces leave from the pins
pin_starts = []
for n in range(14):
    for attempt in range(40):
        w, h = int(rng.integers(2, 4)), int(rng.integers(2, 5))
        cx, cy = int(rng.integers(cu0 + 3, cu1 - 3 - w)), int(rng.integers(cv0 + 3, cv1 - 3 - h))
        if not occ[cy - 2:cy + h + 2, cx - 2:cx + w + 2].any():
            occ[cy:cy + h, cx:cx + w] = True
            draw_rect(chips, (cx + w / 2) * CELL, (cy + h / 2) * CELL, w * CELL - 6, h * CELL - 6, 1.0)
            # pins on the long sides -> spawn traces outward
            if h >= w:
                for yy in range(cy, cy + h):
                    pin_starts.append(((cx - 1, yy), 6)); pin_starts.append(((cx + w, yy), 2))
            else:
                for xx in range(cx, cx + w):
                    pin_starts.append(((xx, cy - 1), 4)); pin_starts.append(((xx, cy + h), 0))
            break
rng.shuffle(pin_starts)
for (start, di) in pin_starts:
    sx, sy = start
    if not free(sx, sy, margin=0) or occ[sy, sx]: continue
    path = route(sx, sy, di, int(rng.integers(8, 40)), [(sx, sy)])
    if len(path) >= 4:
        # draw the stub from the chip edge
        commit(path, via_start=False, via_end=True)
        draw_segment(traces, px(sx) - DIRS[di][0] * CELL * 0.5, px(sy) - DIRS[di][1] * CELL * 0.5, px(sx), px(sy), 4.2)

# 2) free traces, mostly running along the body (v direction), with 45deg jogs
for n in range(340):
    cx, cy = int(rng.integers(cu0, cu1 + 1)), int(rng.integers(cv0, cv1 + 1))
    if not free(cx, cy): continue
    di = int(rng.choice([0, 4, 0, 4, 1, 3, 5, 7, 2, 6]))          # bias toward +-v
    path = route(cx, cy, di, int(rng.integers(10, 55)), [(cx, cy)])
    if len(path) >= 7:
        commit(path)
# 3) a few parallel "bus" pairs: duplicate a long trace shifted by 2 cells where free
circuit = np.maximum(np.maximum(traces, pads), chips * 0.9) * belly
# fine background micro-grid in the belly zone
micro = (np.maximum(np.exp(-((np.mod(U * W, 28) - 14) / 1.0) ** 2), np.exp(-((np.mod(V * H, 28) - 14) / 1.0) ** 2))) * belly * 0.25

# --- lateral line + sensor dots -----------------------------------------------
dots = np.zeros((H, W), np.float32)
for side in (0.27, 0.73):
    for k in range(16):
        vv = 0.21 + k * 0.049
        draw_disc(dots, side * W + 6 * math.sin(k), img_v(vv) * H, 4.5)
for sgn in (-1, 1):   # two sensor dots behind each eye
    for (uu, vv) in ((0.5 + sgn * 0.37, 0.125), (0.5 + sgn * 0.34, 0.135)):
        draw_disc(dots, uu * W, img_v(vv) * H, 5.0)

# --- height -> normal ----------------------------------------------------------
height = sc_h * sc_amp * 1.0
height = height - grooves * 0.9 - face * 0.25 - plate_step + ridge * 0.35 + circuit * 0.25 + dots * 0.4
noise = rng.normal(0, 1, (H // 8, W // 8)).astype(np.float32)
noise = np.kron(noise, np.ones((8, 8), np.float32))
height = height + noise * 0.01
normal = normal_from_height(height, strength=12.0)

# --- base colour ------------------------------------------------------------------
pearl = np.array([0.90, 0.915, 0.945])
head_c = np.array([0.90, 0.915, 0.94])
blue_hi = np.array([0.60, 0.78, 0.99]); blue_lo = np.array([0.20, 0.47, 0.93])
base = np.ones((H, W, 3)) * pearl
base = base * (1 - head_mask[..., None]) + head_c * head_mask[..., None]
blue = blue_hi * (1 - belly[..., None]) + blue_lo * belly[..., None]
bmix = (belly * 0.85)[..., None]
base = base * (1 - bmix) + blue * bmix
base = base * (1 + (sc_rand[..., None] - 0.5) * 0.08 * sc_amp[..., None])
base = base * (0.90 + 0.10 * np.clip(sc_h, 0, 1))[..., None]          # darker under scale edges
base = base * (1 - micro[..., None] * 0.6) + np.array([0.55, 0.85, 1.0]) * micro[..., None] * 0.6
cmix = circuit[..., None]
base = base * (1 - cmix) + np.array([0.62, 0.90, 1.0]) * cmix
base = base * (1 - grooves[..., None] * 0.55)
base = base * (1 - face[..., None] * 0.35)                                                        # soft eye seat shadow
base = base * (1 - ridge[..., None] * 0.06)
dark = ports
base = base * (1 - dark[..., None]) + np.array([0.03, 0.04, 0.07]) * dark[..., None]
base = base * (1 - status[..., None] * 0.5) + np.array([0.5, 0.85, 1.0]) * status[..., None] * 0.5
base = base * (1 - dots[..., None]) + np.array([0.6, 0.9, 1.0]) * dots[..., None]
# --- emissive --------------------------------------------------------------------
cyan = np.array([0.30, 0.72, 1.0])
em = cyan * (circuit ** 1.0)[..., None] * (0.55 + 0.45 * belly[..., None])
em = em + cyan * (micro * 0.35)[..., None]
em = em + np.array([0.12, 0.40, 1.0]) * (belly * 0.10)[..., None]
em = em + cyan * dots[..., None]
em = em + cyan * (status * 0.45 + ports * 0.35)[..., None]
em = np.clip(em, 0, 1)

# --- ORM --------------------------------------------------------------------------
rough = 0.30 + 0.12 * (1 - np.clip(sc_h, 0, 1)) * sc_amp + grooves * 0.3
rough = rough * (1 - head_mask) + 0.16 * head_mask
rough = rough + dark * 0.3
rough = rough * (1 - belly * 0.3) - circuit * 0.12
metal = 0.06 * (1 - head_mask) + 0.45 * head_mask * (1 - dark)
orm = np.stack([np.ones_like(rough), np.clip(rough, 0.05, 1), np.clip(metal, 0, 1)], -1)

# --- front plate (own UV island): machined face plate with intake slot, notch, sensor pairs ----------
px = (U - 0.5) / PLATE_R; py = (V_IMG - PLATE_C) / PLATE_R          # -1..1 across the plate, py up = fish back
pr = np.sqrt(px * px + py * py)
plate = pr < 1.02
ps = 1.0 / (PLATE_R * W)                                                 # one pixel in plate units
def pbox(x0, x1, y0, y1, soft=1.5):
    return (smoothstep(x0 - soft * ps, x0, px) * (1 - smoothstep(x1, x1 + soft * ps, px)) *
            smoothstep(y0 - soft * ps, y0, py) * (1 - smoothstep(y1, y1 + soft * ps, py)))
# intake grille: three parallel horizontal slits, the middle one lit; no face-like features
p_slot = np.zeros_like(U)
p_core = np.zeros_like(U)
p_bevel = np.zeros_like(U)
p_ring = np.zeros_like(U)                                                                       # plain tip plate
p_sensor = np.zeros_like(U); p_sensor_glow = np.zeros_like(U)                                   # four recessed bolts near the rim
p_vents = np.zeros_like(U)
p_dark = np.clip(p_slot + p_sensor * 0.55 + p_vents, 0, 1)
plate_h = -p_slot * 1.6 - p_vents * 0.8 - p_sensor * 0.6 - p_ring * 0.7 - p_bevel * 0.5
plate_col = np.ones((H, W, 3)) * head_c * (1 - p_bevel[..., None] * 0.15)
plate_col = plate_col * (1 - p_dark[..., None]) + np.array([0.03, 0.04, 0.07]) * p_dark[..., None]
plate_col = plate_col * (1 - p_ring[..., None] * 0.45)
glow = np.clip(p_core + p_sensor_glow, 0, 1)
plate_col = plate_col * (1 - glow[..., None] * 0.7) + np.array([0.45, 0.82, 1.0]) * glow[..., None] * 0.7
plate_em = cyan * (p_core * 0.6 + p_sensor_glow * 0.7)[..., None]
plate_rough = 0.14 + p_dark * 0.3 + p_bevel * 0.1
plate_metal = 0.45 * (1 - p_dark)
# the rest of the island strip (outside the disc) just carries the head colour
strip = V_IMG < PLATE_H
base = np.where(strip[..., None], head_c, base)
em = np.where(strip[..., None], 0.0, em); height = np.where(strip, 0.0, height)
rough = np.where(strip, 0.16, rough); metal = np.where(strip, 0.45, metal)
base = np.where(plate[..., None], plate_col, base)
em = np.where(plate[..., None], plate_em, em)
height = np.where(plate, plate_h, height)
rough = np.where(plate, plate_rough, rough); metal = np.where(plate, plate_metal, metal)
normal = normal_from_height(height, strength=12.0)
orm = np.stack([np.ones_like(rough), np.clip(rough, 0.05, 1), np.clip(metal, 0, 1)], -1)

save_image("CF_body_basecolor", base)
save_image("CF_body_orm", orm, noncolor=True)
save_image("CF_body_normal", normal, noncolor=True)
save_image("CF_body_emissive", em)

# =========================================================== FINS
def fin_atlas(name, rects, size=1024):
    u = (np.arange(size) + 0.5) / size
    Uf, Vf = np.meshgrid(u, u)
    base = np.ones((size, size, 3)) * np.array([0.93, 0.95, 0.98])
    em = np.zeros((size, size, 3)); height = np.zeros((size, size)); alpha = np.ones((size, size))
    rough = np.full((size, size), 0.38)
    for (u0, v0, u1, v1, nrays) in rects:
        inside = (Uf >= u0) & (Uf <= u1) & (Vf >= v0) & (Vf <= v1)
        s = np.clip((Uf - u0) / (u1 - u0), 0, 1); r = np.clip((Vf - v0) / (v1 - v0), 0, 1)
        # bony rays (lepidotrichia): sharp ridges that fan out, bifurcating in the outer half
        nr = nrays - 1
        px_per_ray = (u1 - u0) * size / nr
        d_main = np.abs(np.mod(s * nr + 0.5, 1) - 0.5) * px_per_ray            # px distance to nearest main ray
        d_half = np.abs(np.mod(s * nr * 2 + 0.5, 1) - 0.5) * px_per_ray / 2     # nearest half ray (branch)
        ray_main = np.exp(-(d_main / 2.6) ** 2)
        branch = np.exp(-(d_half / 1.9) ** 2) * smoothstep(0.45, 0.6, r)         # branches appear from mid-fin outward
        rays = np.maximum(ray_main, branch * 0.7)
        # rays are segmented (tiny joints every few % of the length) and taper toward the edge
        joints = 1 - 0.20 * np.exp(-((np.mod(r * 30, 1) - 0.5) / 0.10) ** 2) * smoothstep(0.08, 0.2, r)
        taper = 1.0 - 0.35 * r
        ridge = rays * joints * taper * (0.4 + 0.6 * smoothstep(0.0, 0.08, r))
        # membrane: translucent, slightly sagging between rays, bluish toward the edge
        edge = r ** 1.6
        sag = (1 - ray_main) * 0.12
        col = np.array([0.95, 0.96, 0.99]) * (1 - edge[..., None]) + np.array([0.70, 0.82, 0.99]) * edge[..., None]
        col = col * (1 - rays[..., None] * 0.08) + np.array([0.99, 0.99, 1.0]) * rays[..., None] * 0.08
        base = np.where(inside[..., None], col, base)
        height = np.where(inside, ridge * 1.0 - sag, height)
        em = np.where(inside[..., None], (np.array([0.30, 0.65, 1.0]) * (rays * r ** 2.2 * 0.55 + edge * 0.05)[..., None]), em)
        alpha = np.where(inside, 0.62 + 0.38 * rays + 0.12 * (1 - r) * (1 - rays), alpha)          # membrane see-through, rays solid
        alpha = np.where(inside, np.clip(alpha, 0, 1), alpha)
        rough = np.where(inside, 0.45 - 0.2 * rays - 0.08 * edge, rough)
    normal = normal_from_height(height, strength=11.0)
    orm = np.stack([np.ones_like(rough), np.clip(rough, 0.05, 1), np.zeros_like(rough)], -1)
    save_image(name + "_basecolor", base, alpha)
    save_image(name + "_orm", orm, noncolor=True)
    save_image(name + "_normal", normal, noncolor=True)
    save_image(name + "_emissive", np.clip(em, 0, 1))

fin_atlas("CF_fins", [(0.02, 0.02, 0.48, 0.48, 13), (0.52, 0.02, 0.98, 0.48, 13),
                      (0.02, 0.52, 0.24, 0.98, 9), (0.27, 0.52, 0.49, 0.98, 9), (0.52, 0.52, 0.98, 0.98, 11)])
fin_atlas("CF_tail", [(0.02, 0.02, 0.98, 0.98, 21)])

result = {"written": sorted(os.listdir(OUT_DIR))}

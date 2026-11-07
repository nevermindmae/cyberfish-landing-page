import * as THREE from 'three';

/**
 * Procedural PCB-style circuit mask, drawn once at startup on a canvas and
 * used as the fish body's emissiveMap. White traces on black.
 *
 * Texture space: x = around the body (u), y = along the body (v, tail -> head).
 * The lathe's seam (u = 0) is the belly and u = 0.5 is the back, so the two
 * flanks sit around u = 0.25 and u = 0.75. Traces are confined to those bands
 * and to the middle of the body, leaving the head and tail stalk clean.
 */
export function createCircuitTexture(width = 1024, height = 512, seed = 7): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);

  const rand = mulberry32(seed);
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];

  // Trace layout grid, so parallel runs line up like a real board.
  const pitch = 14;
  const snap = (v: number): number => Math.round(v / pitch) * pitch;

  const flanks = [
    { x0: width * 0.09, x1: width * 0.41 },
    { x0: width * 0.59, x1: width * 0.91 },
  ];
  const y0 = height * 0.2;
  const y1 = height * 0.88;

  ctx.lineCap = 'square';
  ctx.lineJoin = 'miter';
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';

  const node = (x: number, y: number, size: number): void => {
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
  };

  const tracesPerFlank = 34;
  for (const flank of flanks) {
    for (let i = 0; i < tracesPerFlank; i++) {
      let x = snap(flank.x0 + rand() * (flank.x1 - flank.x0));
      let y = snap(y0 + rand() * (y1 - y0));
      const segments = 2 + Math.floor(rand() * 4);
      const lineWidth = rand() < 0.75 ? 3 : 4;
      ctx.lineWidth = lineWidth;

      node(x, y, lineWidth + 4);
      ctx.beginPath();
      ctx.moveTo(x, y);
      let horizontal = rand() < 0.5;
      for (let s = 0; s < segments; s++) {
        const len = pitch * (2 + Math.floor(rand() * 5));
        const dir = pick([-1, 1] as const);
        let nx = x;
        let ny = y;
        if (horizontal) nx = clamp(x + dir * len, flank.x0, flank.x1);
        else ny = clamp(y + dir * len, y0, y1);
        nx = snap(nx);
        ny = snap(ny);
        ctx.lineTo(nx, ny);
        x = nx;
        y = ny;
        horizontal = !horizontal;
        // Occasional small node at a bend.
        if (rand() < 0.3) node(x, y, lineWidth + 2);
      }
      ctx.stroke();
      node(x, y, lineWidth + 4);

      // Sometimes a short parallel companion trace, offset by one pitch.
      if (rand() < 0.3) {
        ctx.beginPath();
        const off = pitch * pick([-1, 1] as const);
        const len = pitch * (2 + Math.floor(rand() * 4));
        const sx = snap(clamp(x + off, flank.x0, flank.x1));
        const sy = snap(clamp(y - len / 2, y0, y1));
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx, snap(clamp(sy + len, y0, y1)));
        ctx.stroke();
      }
    }

    // A few isolated pads.
    for (let i = 0; i < 10; i++) {
      node(
        snap(flank.x0 + rand() * (flank.x1 - flank.x0)),
        snap(y0 + rand() * (y1 - y0)),
        6,
      );
    }
  }

  // Soft fade toward the band edges so traces never end abruptly on the belly,
  // back, head or tail. Multiply by a vignette mask using composite ops.
  ctx.globalCompositeOperation = 'destination-in';
  const gy = ctx.createLinearGradient(0, 0, 0, height);
  gy.addColorStop(0.17, 'rgba(0,0,0,0)');
  gy.addColorStop(0.27, 'rgba(0,0,0,1)');
  gy.addColorStop(0.8, 'rgba(0,0,0,1)');
  gy.addColorStop(0.92, 'rgba(0,0,0,0)');
  ctx.fillStyle = gy;
  ctx.fillRect(0, 0, width, height);

  const gx = ctx.createLinearGradient(0, 0, width, 0);
  const stops: Array<[number, number]> = [
    [0.0, 0],
    [0.09, 0],
    [0.16, 1],
    [0.34, 1],
    [0.42, 0],
    [0.58, 0],
    [0.66, 1],
    [0.84, 1],
    [0.91, 0],
    [1.0, 0],
  ];
  for (const [p, a] of stops) gx.addColorStop(p, `rgba(0,0,0,${a})`);
  ctx.fillStyle = gx;
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'source-over';

  // Flatten onto black so the alpha fade becomes a brightness fade.
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'source-over';

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Small seeded PRNG so the board looks the same on every load. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

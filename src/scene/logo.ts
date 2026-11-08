/**
 * The CyberFish mark as a cloud of points, for the floor chapter. The SVG
 * is drawn to an offscreen canvas and points are thrown at it until
 * enough land inside the mark, so any shape in the file works unchanged.
 */

const MARK_URL = '/cyberfish-mark.svg';
/** Raster width used for the hit test (height follows the mark's aspect). */
const RASTER_W = 1200;

/**
 * Resolve to `count` points (x, y, z triples) in a local frame: the mark
 * centred on the origin, `width` units wide, x right, y up, facing +Z. A
 * little depth jitter and a soft spread at the edges keep it from reading
 * as a flat cut-out.
 */
export async function loadLogoPoints(count: number, width: number): Promise<Float32Array> {
  const img = await loadImage(MARK_URL);
  const aspect = img.naturalWidth / img.naturalHeight;
  const w = RASTER_W;
  const h = Math.round(RASTER_W / aspect);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('No 2D context for the mark');
  ctx.drawImage(img, 0, 0, w, h);
  const alpha = ctx.getImageData(0, 0, w, h).data;
  const inside = (x: number, y: number): boolean => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= w || yi >= h) return false;
    return alpha[(yi * w + xi) * 4 + 3] > 96;
  };

  const out = new Float32Array(count * 3);
  const scale = width / w;
  const height = h * scale;
  let n = 0;
  let tries = 0;
  while (n < count && tries < count * 400) {
    tries++;
    const x = Math.random() * w;
    const y = Math.random() * h;
    if (!inside(x, y)) continue;
    // Soft edges: a small normal-ish scatter around the sampled point.
    const jx = (Math.random() + Math.random() - 1) * 0.012 * w;
    const jy = (Math.random() + Math.random() - 1) * 0.012 * w;
    out[n * 3] = (x + jx) * scale - width / 2;
    out[n * 3 + 1] = height / 2 - (y + jy) * scale;
    out[n * 3 + 2] = (Math.random() + Math.random() - 1) * 0.08 * width * 0.1;
    n++;
  }
  return n === count ? out : out.slice(0, n * 3);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${url}`));
    img.src = url;
  });
}

/**
 * Loading overlay. Port of reference/loading-screen.html.
 *
 * The markup and styles live in index.html so the overlay paints before any
 * module script is fetched. This class only drives it: callers report real
 * progress via setProgress(); the shown value eases toward it so it never
 * jumps, and at 100% the mark docks toward the nav and the overlay fades.
 */

// Mark viewBox x-range; the clip rect sweeps across this.
const X0 = 30;
const X1 = 1650;
const W = X1 - X0;

const EASE = 0.08;
const DOCK_DELAY_MS = 500;
const FADE_DELAY_MS = 500;
const FADE_MS = 600;

function el<T extends Element>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} missing from loader markup`);
  return node as unknown as T;
}

export class Loader {
  /** Resolves once the overlay has fully faded out and been removed. */
  readonly done: Promise<void>;

  private readonly root = el<HTMLElement>('loader');
  private readonly mark = el<SVGSVGElement>('mark');
  private readonly clip = el<SVGRectElement>('cliprect');
  private readonly halo = el<SVGUseElement>('halo');
  private readonly edge = el<SVGGElement>('edge');
  private readonly edgeBlur = el<SVGRectElement>('edgeblur');
  private readonly edgeLine = el<SVGRectElement>('edgeline');
  private readonly pct = el<HTMLElement>('pct');
  private readonly label = el<HTMLElement>('label');

  private readonly reducedMotion: boolean;
  private target = 0;
  private shown = 0;
  private finished = false;
  private resolveDone!: () => void;

  constructor(reducedMotion: boolean) {
    this.reducedMotion = reducedMotion;
    this.done = new Promise((resolve) => (this.resolveDone = resolve));
    this.render(0);
    requestAnimationFrame(this.tick);
  }

  /** Report real progress in 0..1. Never moves backwards. */
  setProgress(p: number): void {
    this.target = Math.max(this.target, Math.min(1, p));
  }

  private readonly tick = (): void => {
    if (this.reducedMotion) {
      this.shown = this.target;
    } else {
      this.shown += (this.target - this.shown) * EASE;
      if (this.target >= 1 && this.shown > 0.995) this.shown = 1;
    }
    this.render(this.shown);
    if (this.shown < 1) requestAnimationFrame(this.tick);
    else if (!this.finished) this.finish();
  };

  private render(p: number): void {
    const x = X0 + W * p;
    this.clip.setAttribute('width', String(x - X0));
    this.edgeBlur.setAttribute('x', String(x - 7));
    this.edgeLine.setAttribute('x', String(x - 3));

    let fade = p > 0.85 ? 1 - (p - 0.85) / 0.15 : 1;
    if (this.reducedMotion) fade = 0;
    this.halo.setAttribute('opacity', (0.9 * fade).toFixed(3));
    this.edge.setAttribute('opacity', fade.toFixed(3));

    this.pct.textContent = `${Math.round(p * 100)}%`;
  }

  private finish(): void {
    this.finished = true;
    this.label.textContent = 'Ready';
    this.label.style.color = '#2EA8FF';

    const fadeOut = (): void => {
      this.root.classList.add('done');
      window.setTimeout(() => {
        this.root.remove();
        this.resolveDone();
      }, FADE_MS);
    };

    if (this.reducedMotion) {
      window.setTimeout(fadeOut, DOCK_DELAY_MS);
      return;
    }

    window.setTimeout(() => {
      // Dock toward the nav mark position. Refined once the nav exists.
      this.mark.style.transition = 'transform 900ms cubic-bezier(.2,.8,.2,1)';
      this.mark.style.transform = 'scale(0.42) translateY(-80px)';
      window.setTimeout(fadeOut, FADE_DELAY_MS);
    }, DOCK_DELAY_MS);
  }
}

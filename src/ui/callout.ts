/**
 * Callout for the board inside the DeKoi unit: a dot on the part, a leader
 * out of the box (one diagonal leg, then a short horizontal one), and the
 * label at the end. The scene feeds it the part's screen position every
 * frame; this picks the leader's direction so the label lands in open water
 * and draws it in once told the lid is open.
 */

export interface CalloutPoint {
  /** CSS pixels, relative to the viewport. */
  x: number;
  y: number;
  /** The lid is open: draw the callout in. */
  open: boolean;
}

/** Leader legs, in CSS pixels. */
const LEG_X = 150;
const LEG_Y = 90;
const LEG_TAIL = 50;
const LABEL_GAP = 12;
/** Least distance between the label and the viewport edge. */
const EDGE_MARGIN = 20;

export class Callout {
  private readonly root: HTMLElement;
  private readonly leader: SVGPolylineElement;
  private readonly dot: SVGCircleElement;
  private readonly label: HTMLElement;
  private on = false;

  constructor(root: HTMLElement) {
    this.root = root;
    this.leader = root.querySelector('.callout-leader') as SVGPolylineElement;
    this.dot = root.querySelector('.callout-dot') as SVGCircleElement;
    this.label = root.querySelector('.callout-label') as HTMLElement;
  }

  /** Place the callout for this frame, or clear it (`null`) when the deep is gone. */
  place(p: CalloutPoint | null): void {
    if (!p) {
      this.setOn(false);
      return;
    }
    const w = window.innerWidth;
    const h = window.innerHeight;
    // Lead away from the box toward the emptier side, and down unless the
    // part is already low in the frame.
    const dx = p.x > w * 0.5 ? -1 : 1;
    const dy = p.y > h * 0.7 ? -1 : 1;
    const ey = p.y + dy * LEG_Y;
    let ex = p.x + dx * LEG_X;
    let tx = ex + dx * LEG_TAIL;

    // Label sits past the tail, vertically centred on it, on the far side.
    // Keep it inside the frame: shorten the leader rather than run off.
    const lw = this.label.offsetWidth;
    const lh = this.label.offsetHeight;
    let lx = dx < 0 ? tx - LABEL_GAP - lw : tx + LABEL_GAP;
    const minX = EDGE_MARGIN;
    const maxX = w - EDGE_MARGIN - lw;
    if (lx < minX || lx > maxX) {
      lx = Math.min(Math.max(lx, minX), maxX);
      tx = dx < 0 ? lx + lw + LABEL_GAP : lx - LABEL_GAP;
      if ((tx - ex) * dx < 0) ex = tx;
    }

    this.dot.setAttribute('cx', p.x.toFixed(1));
    this.dot.setAttribute('cy', p.y.toFixed(1));
    this.leader.setAttribute(
      'points',
      `${p.x.toFixed(1)},${p.y.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)} ${tx.toFixed(1)},${ey.toFixed(1)}`,
    );
    this.label.style.transform = `translate(${lx.toFixed(1)}px, ${(ey - lh / 2).toFixed(1)}px)`;

    this.setOn(p.open);
  }

  private setOn(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    this.root.classList.toggle('on', on);
  }
}

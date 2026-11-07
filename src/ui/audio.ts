/**
 * UI sound effects. Web Audio for low-latency one-shots; buffers are fetched
 * early and decoded on first use. Nothing plays unless the visitor opted in,
 * and the preference is remembered in localStorage and mirrored on
 * `html[data-sound]` for CSS.
 */
export type SfxName = 'hover' | 'confirm1' | 'confirm2' | 'error' | 'dive';

const FILES: Record<SfxName, string> = {
  hover: '/sfx/hover.mp3',
  confirm1: '/sfx/confirm-1.mp3',
  confirm2: '/sfx/confirm-2.mp3',
  error: '/sfx/error.mp3',
  dive: '/sfx/dive.mp3',
};

const GAIN: Record<SfxName, number> = {
  hover: 0.35,
  confirm1: 0.7,
  confirm2: 0.7,
  error: 0.6,
  dive: 0.85,
};

const STORAGE_KEY = 'cyberfish.sound';

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly raw = new Map<SfxName, Promise<ArrayBuffer>>();
  private readonly buffers = new Map<SfxName, Promise<AudioBuffer>>();
  private readonly listeners = new Set<(on: boolean) => void>();
  private on = false;
  /** Throttle for hover: at most one per 80 ms so a fast sweep does not stutter. */
  private lastHover = 0;

  constructor() {
    this.apply(false);
  }

  get enabled(): boolean {
    return this.on;
  }

  /** Stored preference from a previous visit, if any. */
  static storedPreference(): boolean | null {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      return v === null ? null : v === 'on';
    } catch {
      return null;
    }
  }

  /** Start downloading the files; call once the page is interactive. */
  preload(): void {
    for (const name of Object.keys(FILES) as SfxName[]) this.fetchRaw(name);
  }

  /** Turn sound on or off. Call from a user gesture when turning on. */
  setEnabled(on: boolean): void {
    if (on === this.on) return;
    this.apply(on);
    try {
      localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
    } catch {
      /* private mode; ignore */
    }
    if (on) void this.context().resume();
    for (const fn of this.listeners) fn(on);
  }

  /**
   * Call synchronously inside a user gesture: creates and resumes the
   * context and decodes every buffer, so later plays are instant and Safari's
   * gesture requirement is met.
   */
  unlock(): void {
    const ctx = this.context();
    void ctx.resume();
    for (const name of Object.keys(FILES) as SfxName[]) void this.buffer(name).catch(() => {});
  }

  onChange(fn: (on: boolean) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Play a one-shot. Silently does nothing while sound is off. */
  play(name: SfxName): void {
    if (!this.on) return;
    if (name === 'hover') {
      const now = performance.now();
      if (now - this.lastHover < 80) return;
      this.lastHover = now;
    }
    const ctx = this.context();
    if (ctx.state === 'suspended') void ctx.resume();
    void this.buffer(name).then((buffer) => {
      if (!this.on || !this.master) return;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = GAIN[name];
      src.connect(gain).connect(this.master);
      src.start();
    });
  }

  private apply(on: boolean): void {
    this.on = on;
    document.documentElement.dataset.sound = on ? 'on' : 'off';
  }

  private context(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  private fetchRaw(name: SfxName): Promise<ArrayBuffer> {
    let p = this.raw.get(name);
    if (!p) {
      p = fetch(FILES[name]).then((r) => {
        if (!r.ok) throw new Error(`SFX ${name}: HTTP ${r.status}`);
        return r.arrayBuffer();
      });
      p.catch(() => this.raw.delete(name));
      this.raw.set(name, p);
    }
    return p;
  }

  private buffer(name: SfxName): Promise<AudioBuffer> {
    let p = this.buffers.get(name);
    if (!p) {
      // decodeAudioData detaches the buffer, so hand it a copy.
      p = this.fetchRaw(name).then((raw) => this.context().decodeAudioData(raw.slice(0)));
      p.catch(() => this.buffers.delete(name));
      this.buffers.set(name, p);
    }
    return p;
  }
}

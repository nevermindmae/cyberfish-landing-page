import './ui/tokens.css';
import './ui/base.css';
import './ui/nav.css';
import './ui/hero.css';
import './ui/cta.css';
import { Loader } from './ui/loader';
import { Sfx } from './ui/audio';
import { CyberScene } from './scene';

const root = document.getElementById('scene');
if (!root) throw new Error('#scene container missing');

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile = window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;

const sfx = new Sfx();
sfx.preload();

// Sound toggle in the nav. Hover plays the button hover sound (only audible
// once sound is on); click flips the preference.
const toggle = document.getElementById('sound-toggle') as HTMLButtonElement | null;
const toggleState = toggle?.querySelector<HTMLElement>('.sound-state') ?? null;
const reflectSound = (on: boolean): void => {
  if (!toggle) return;
  toggle.setAttribute('aria-pressed', String(on));
  if (toggleState) toggleState.textContent = on ? 'on' : 'off';
};
sfx.onChange(reflectSound);
reflectSound(false);
toggle?.addEventListener('pointerenter', () => sfx.play('hover'));
toggle?.addEventListener('focus', () => sfx.play('hover'));
toggle?.addEventListener('click', () => {
  const on = !sfx.enabled;
  if (on) sfx.unlock();
  sfx.setEnabled(on);
  // Confirmation first, then the music comes back (if the page is entered).
  if (on) void sfx.play('confirm1').then(() => sfx.resumeMusic());
});

// "Enter with sound": unlock inside the gesture itself (Safari needs the
// call stack) and play the confirmation right away, not after the loader's
// fade.
// The background track follows straight on from the confirmation.
document.getElementById('enter-sound')?.addEventListener('click', () => {
  sfx.unlock();
  sfx.setEnabled(true);
  void sfx.play('confirm2').then(() => sfx.startMusic());
});
// pointerdown is already a user activation and lands ~100 ms before click:
// start the context and decode the buffers then, so the click plays at once.
window.addEventListener('pointerdown', () => sfx.unlock(), { once: true, capture: true });

// Either enter button: the scene starts to surface from the dark at once
// (html[data-entering], see base.css), underneath the overlay's own fade, so
// the two dissolve into each other instead of the picture snapping on.
for (const id of ['enter-sound', 'enter-mute']) {
  document.getElementById(id)?.addEventListener('click', () => {
    document.documentElement.dataset.entering = '';
  });
}

// Progress milestones. Reaching this script means the module graph (three.js
// included) has been fetched and evaluated. The fish GLB (~9.5 MB) is the
// bulk of the load, so its download drives the 0.2..0.9 band.
const loader = new Loader(reducedMotion);
loader.setProgress(0.15);

const scene = new CyberScene(root, { reducedMotion, mobile });
// Dev: ?diveslow=4 plays the dive at quarter speed, and exposes the scene.
const diveSlow = Number(new URLSearchParams(location.search).get('diveslow'));
if (import.meta.env.DEV && diveSlow > 1) {
  scene.diveTimeScale = 1 / diveSlow;
  (window as unknown as { __scene: CyberScene }).__scene = scene;
}
loader.setProgress(0.2);

try {
  await scene.loadFish((f) => loader.setProgress(0.2 + f * 0.7));
} catch (err) {
  // Reveal the page anyway rather than leaving the visitor on the loader.
  console.error('Fish model failed to load', err);
}
loader.setProgress(0.92);

scene.compile();
loader.setProgress(0.97);

scene.start();
// First frame is on screen behind the overlay; reveal.
requestAnimationFrame(() => loader.setProgress(1));

// The visitor's enter choice (sound itself was handled in the click above).
// Entering muted still marks the music as wanted, so switching sound on
// later brings it in after that confirmation.
loader.done.then(({ sound }) => {
  document.documentElement.dataset.entered = '';
  sfx.setEnabled(sound);
  if (!sound) sfx.startMusic();
});

// "Deploy The Decoy?": dive under. The HUD sinks away, the camera goes
// through the water, and once the frame is black a plain black screen takes
// over (the next chapter of the page goes here).
const deploy = document.getElementById('deploy') as HTMLButtonElement | null;
if (deploy) {
  deploy.addEventListener('pointerenter', () => sfx.play('hover'));
  deploy.addEventListener('focus', () => sfx.play('hover'));
  deploy.addEventListener('click', async () => {
    const html = document.documentElement;
    if ('diving' in html.dataset) return;
    html.dataset.diving = '';
    deploy.disabled = true;
    await scene.dive({ onSplash: () => void sfx.play('dive') });
    html.dataset.dived = '';
    // Let the black screen's fade land before the canvas stops updating.
    setTimeout(() => scene.stop(), 500);
  });
}

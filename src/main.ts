import './ui/tokens.css';
import './ui/base.css';
import './ui/nav.css';
import './ui/hero.css';
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
  if (on) sfx.play('confirm1');
});

// Unlock audio inside the enter gesture itself (Safari needs the call stack),
// so the confirmation can play the moment the loader has faded.
document.getElementById('enter-sound')?.addEventListener('click', () => sfx.unlock());

// Progress milestones. Reaching this script means the module graph (three.js
// included) has been fetched and evaluated. The fish GLB (~9.5 MB) is the
// bulk of the load, so its download drives the 0.2..0.9 band.
const loader = new Loader(reducedMotion);
loader.setProgress(0.15);

const scene = new CyberScene(root, { reducedMotion, mobile });
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

// The visitor's enter choice. The click on the enter button is the user
// gesture that unlocks audio; "Enter with sound" plays confirmation 2.
loader.done.then(({ sound }) => {
  document.documentElement.dataset.entered = '';
  sfx.setEnabled(sound);
  if (sound) sfx.play('confirm2');
});

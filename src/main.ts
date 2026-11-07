import './ui/tokens.css';
import './ui/base.css';
import './ui/nav.css';
import { Loader } from './ui/loader';
import { CyberScene } from './scene';

const root = document.getElementById('scene');
if (!root) throw new Error('#scene container missing');

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile = window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;

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

// The visitor's enter choice. Audio can read `html[data-sound]` or await
// `loader.done` once it is wired in; the user gesture on the button also
// satisfies browser autoplay policies.
loader.done.then(({ sound }) => {
  document.documentElement.dataset.sound = sound ? 'on' : 'off';
});

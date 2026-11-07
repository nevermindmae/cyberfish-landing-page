import './ui/tokens.css';
import './ui/base.css';
import { Loader } from './ui/loader';
import { CyberScene } from './scene';

const root = document.getElementById('scene');
if (!root) throw new Error('#scene container missing');

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile = window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;

// Progress milestones. Reaching this script means the module graph (three.js
// included) has been fetched and evaluated. Asset loads via a LoadingManager
// can be wired into the 0.35..0.6 band when the fish adds textures.
const loader = new Loader(reducedMotion);
loader.setProgress(0.35);

const scene = new CyberScene(root, { reducedMotion, mobile });
loader.setProgress(0.6);

scene.compile();
loader.setProgress(0.85);

scene.start();
// First frame is on screen behind the overlay; reveal.
requestAnimationFrame(() => loader.setProgress(1));

// The visitor's enter choice. Audio can read `html[data-sound]` or await
// `loader.done` once it is wired in; the user gesture on the button also
// satisfies browser autoplay policies.
loader.done.then(({ sound }) => {
  document.documentElement.dataset.sound = sound ? 'on' : 'off';
});

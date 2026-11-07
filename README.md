# DeKoi by CyberFish — landing page

Single-page landing site for **DeKoi**, a small box you plug into your home or office network. It pretends to be a storage drive. If something touches it, you get an alert on your phone within a minute.

Inspired by my favourite three.js projects, DeKoi came to life in just under 24 hours thanks to Midjourney, Blender and Claude. Built from a separate repository as we considered it part of the presentation rather than the product itself.

## Stack

- [Vite](https://vitejs.dev/) + TypeScript
- [three.js](https://threejs.org/) for the hero scene: procedural night sea (Gerstner waves), sky dome, the CyberFish model and a bloom/grain post pass
- Plain CSS with design tokens (`src/ui/tokens.css`), no UI framework
- Fonts: Michroma and JetBrains Mono via Google Fonts

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check, then build to dist/
npm run preview    # serve the production build
```

## Project layout

| Path | What it is |
|---|---|
| `index.html` | Page shell. Loader styles are inlined so the overlay paints before any script loads |
| `src/main.ts` | Entry point: boots the loader, scene and UI |
| `src/scene/` | three.js scene: `ocean.ts`, `sky.ts`, `fish.ts`, `post.ts`, `palette.ts` and GLSL shaders |
| `src/ui/` | Loader, audio and CSS (tokens, nav, hero, CTA) |
| `public/models/` | Shipped glTF fish models (`cyberfish_posed.glb`, `cyberfish_straight.glb`) |
| `public/sfx/` | Shipped sound effects used by `src/ui/audio.ts` |
| `public/*.svg` | CyberFish mark (flat and glow variants) |
| `assets-src/` | Blender sources and Python build scripts for the fish and ocean scene, plus reference renders |
| `SFX/` | Original audio files before renaming/copying into `public/sfx/` |
| `reference/` | Brand tokens, build brief and visual references. Read, don't ship. `reference/visual-refs/` is gitignored |

## Assets and credits

- **3D model and scene**: the CyberFish and the ocean hero scene were generated procedurally in Blender (see `assets-src/*/README.md` for how to regenerate them). Concept imagery came from Midjourney.
- **SFX**: from ElevenLabs libraries.
- **Background music**: *Digital Horizons*, licensed from [premiumbeat.com](https://www.premiumbeat.com/).
- **Fonts**: Michroma and JetBrains Mono, served from Google Fonts.

## Brand

Colours, typography, logo rules, voice and product facts live in `reference/BRAND.md`. Every CSS value and line of copy should trace back to it.

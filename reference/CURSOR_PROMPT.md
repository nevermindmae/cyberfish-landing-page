# Cursor prompt

Paste everything below the line into Cursor as the first message, with this folder present at `reference/` in the project root.

---

Set up a new project called "CyberFish Landing Page": a single-page landing site for DeKoi by CyberFish, built with Vite + vanilla TypeScript + three.js. No React. Initialise git. Keep it simple enough to ship within 24 hours; this is for a hackathon.

Read `reference/BRAND.md` first and follow it for every colour, font and line of copy. Read `reference/README.md` for what each reference image is for.

## Three.js scene (src/scene/)

Ocean
- A large plane (at least 400 x 400 units, 256 x 256 segments) with a custom vertex shader: 4 to 5 layered Gerstner or sine waves, big slow swells (amplitude roughly 1.5 to 2.5 units, wavelengths 30 to 80 units, periods 8 to 14 seconds) plus small ripple detail. Nothing choppy. Match `reference/visual-refs/hashgraph-ocean.png`.
- Fragment shader: dark navy base, lighter crest shading from the normal, a soft specular from a single cool directional light, and a blue glow contribution on the water directly under the fish (pass the fish position as a uniform, falloff by distance).
- Fog: exponential, colour `--bg-sky-horizon`, so the horizon melts into haze.
- Sky: a large sphere or background shader with a vertical gradient from `--bg-sky-horizon` at the horizon to `--bg-sky-top` at the top. No stars, no moon.

Fish (procedural geometry, no external models). Match `reference/visual-refs/cyberfish.png`.
- Body: a lathe or tube along a spline, about 6 units long, slight taper to a rounded head. MeshPhysicalMaterial, colour `--fish-body`, roughness 0.55, metalness 0.05, clearcoat 0.3.
- Scales: a procedural hexagon pattern mixed into the body via onBeforeCompile, very subtle (about 6% darker lines).
- Circuit traces: an emissive mask on the flanks. Generate a procedural circuit texture (orthogonal line segments with small square nodes, like a PCB) on a canvas at startup, 1024 x 512, and use it as emissiveMap with emissive `--accent` and emissiveIntensity 1.6 to 2.2. Animate a slow pulse by scrolling a soft brightness band along the body every 4 to 6 seconds.
- Fins and tail: thin plane geometries with a custom shader, transparent (opacity 0.35 to 0.6), colour `--fish-fin` with a faint blue edge glow, double-sided, depthWrite false. Vertex shader adds a travelling sine wave so the fins ripple like silk. Tail is the largest, roughly 60% of body length.
- Eye: a small dark sphere (#0a1222) with a tiny specular highlight.

Movement (calm, flowing)
- The fish drifts along a slow closed path (figure-8 or ellipse) centred above the water, 4 to 6 units above the surface, one full loop every 40 to 60 seconds. Smooth banking into turns.
- Body undulation in the vertex shader: a sine wave along the body axis, amplitude increasing toward the tail, about 0.8 Hz.
- Gentle vertical bob of ±0.3 units with an 8 second period.
- Mouse parallax: camera shifts a few degrees toward the cursor, damped. No orbit controls in production.
- Nothing should move fast. If in doubt, halve the speed.

Camera and post
- Camera low, about 1.5 units above the water, looking slightly up at the fish, 35 to 40 degree FOV, like the Hashgraph reference.
- EffectComposer with UnrealBloomPass (strength 0.6 to 0.9, radius 0.6, threshold 0.75) so only the circuit traces and glow bloom, not the body. Subtle film grain pass (about 0.06) and a mild vignette. ACES filmic tone mapping.
- Respect prefers-reduced-motion: freeze undulation and path, keep a static pose.

Performance
- Cap pixel ratio at 1.5. Target 60 fps on a 2022 laptop. Pause the render loop when the tab is hidden. Lower ocean segments on mobile.

## Page structure (index.html + src/ui/)

Loading screen. Port `reference/loading-screen.html` exactly; open it in a browser first to see the intended motion.
- Full-screen `--bg` overlay. The CyberFish mark starts as a faint accent outline and fills from left to right with a glowing scan edge as real loading progress advances (THREE.LoadingManager plus shader compile, eased so it never jumps). From 85% to 100% the glow fades out so the end state is the flat mark. Label "LOADING CONTENT" bottom left, percentage bottom right, both 12px JetBrains Mono uppercase letter-spaced. At 100% the label reads "READY" in `--accent`, the mark scales down and moves to the nav logo position, and the overlay fades over 600ms. The nav mark must appear exactly where the animated mark lands. Respect prefers-reduced-motion as described in the file's comments.
- `reference/visual-refs/loading-bar.png` is only for the label typography, not the bar; the square row has been replaced by the mark.

Frame. See the faint lines around the edge of `reference/visual-refs/hubtown-hud-frame.png`.
- A thin HUD frame around the viewport, inset 24px, 1px lines in `--accent` at 25% opacity, with small 45-degree chamfers in the corners and short perpendicular tick marks at the midpoints, in the spirit of circuit traces. Pure SVG or CSS, no images.

Nav (top, inside the frame)
- Left: `reference/logo/cyberfish-mark.svg` + "CYBERFISH" in Michroma 16px. Right: links in JetBrains Mono 12px uppercase: PRODUCT, HOW IT WORKS, SECURITY, CONTACT.

Hero (over the scene)
- Bottom left: H1 in Michroma, two lines: "A DECOY THAT TELLS YOU" / "WHEN SOMEONE IS INSIDE". Below it, one paragraph in JetBrains Mono: "DeKoi is a small box you plug into your home or office network. It pretends to be a storage drive full of valuable files. Nothing in your household has a reason to touch it, so if something does, you get a plain-language alert on your phone within a minute."
- Bottom right: "SCROLL TO EXPLORE" with a small downward chevron, 12px uppercase.
- Top centre, small: "DeKoi" in Michroma 20px with "BY CYBERFISH" underneath in JetBrains Mono 11px `--accent`.

Below the fold (plain HTML sections; the scene stays fixed behind with a darkening overlay as you scroll)
1. How it works: three steps, each with a Michroma section number (01, 02, 03) and a short JetBrains Mono line. "Plug it in." "Scan the code." "Get the alert." One sentence under each.
2. What it watches: a row of 9 small labelled chips: HTTP, HTTPS, SSH, FTP, TELNET, MYSQL, RDP, VNC, REDIS. Caption: "Nine decoy services. Nothing legitimate ever talks to them."
3. Honest limits: a short list in plain language. Detects, does not block. Does not see phishing or stolen cloud passwords. Android first.
4. Footer: mark, "CyberFish, Oslo", "Built at Oslo Sprint 2026".

All copy in sentence case except HUD labels and chips. No marketing adjectives. Only use product facts from BRAND.md.

## Deliverables
- Working `npm run dev` and `npm run build`.
- README with setup and a short description of the scene architecture.
- Do not copy `reference/visual-refs/` into the build or commit the Hashgraph and Hubtown screenshots; they are inspiration only. The logo SVGs may be copied into `public/`.
- Commit after each milestone: scaffold, ocean, fish, movement, post, UI.

Start with the scaffold and the ocean. Show me a screenshot of the ocean alone before building the fish.

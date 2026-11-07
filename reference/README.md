# reference/

Drop this whole folder into the project root as `reference/`. Cursor should read it, not ship it.

| File | What it is | Use it for |
|---|---|---|
| `BRAND.md` | Colours, fonts, logo rules, voice, product facts | Every CSS value and every line of copy |
| `CURSOR_PROMPT.md` | The build brief | Paste into Cursor as the first message |
| `loading-screen.html` | Standalone loading screen: the mark fills left to right with a glowing scan edge, glow fades at 100%, mark docks into the nav | Port the behaviour into the app; open in a browser to see it |
| `logo/cyberfish-mark.svg` | Flat mark, vector paths | Nav, favicon, footer. OK to copy into `public/` |
| `logo/cyberfish-mark-glow.svg` | Mark with blue halo | Hero only. OK to copy into `public/` |
| `logo/app-icon-1024.png` | Android app icon | Reference for glow intensity. Do not use on the site |
| `visual-refs/hashgraph-ocean.png` | Dark ocean, big slow swells, hazy sky, grain, glowing object above water | Mood, camera height, wave scale, fog. Inspiration only, do not commit |
| `visual-refs/cyberfish.png` | The hero fish: white matte body, hex scales, blue circuit traces, long translucent fins | Fish geometry, materials and proportions |
| `visual-refs/hubtown-hud-frame.png` | Hubtown landing page; note the faint circuit-style frame lines around the viewport edge and the monospace HUD labels | HUD frame, label style. Inspiration only, do not commit |
| `visual-refs/loading-bar.png` | Percentage and "LOADING CONTENT" label in monospace | Label typography only; the square row is superseded by `loading-screen.html` |

Not included on purpose: the koi photo (photoreal, not the direction) and the Midjourney attempts that did not land.

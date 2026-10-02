# Chroma Spheres V15

Audio-reactive 3D shader art in the browser (Three.js r128, no build step). Open `index.html`, or serve the folder with any static server. It runs with a built-in demo beat, so it is alive without music.

## Look
- **7 surface styles:** liquid, oil-slick, toon, hologram, plasma, neon glass, rainbow normals (or a random mix per object).
- **5 deformations:** blob, urchin spikes, twist, ripples, crystal.
- **10 shapes**, **7 layouts** (grid, ring, Fibonacci sphere, galaxy spiral, helix, wave, 3D cloud), **12 colour themes** plus rainbow-per-object, hue rotation and a rainbow cycle.
- **Backgrounds:** night gradient, colour cycle, bass-pulsing, custom. **Stardust modes:** drift, warp, swirl, rain, rise.

## Post-FX Studio
Kaleidoscope, mirror, pixelate, posterize, saturation, CRT scanlines, film grain, vignette, lens, wobble and trails.

## Audio & beat
- Microphone or system/tab audio, mapped to low/mid/high bands per effect, with smoothing and delay (random per object, or a wave from the centre).
- Beat punch (FOV kick + tilt), camera shake, beat flash, shape-shifting, explosions, swarm.

## Directing
- 9 presets, **Verras me** (curated random), **Nuke** (everything random) and **Auto-DJ** (switches scene on the beat).
- Mouse magnet (repel/attract), cinematic camera, glitch, autopilot.

## Output
PNG export, **WebM video recording** (with audio when audio input is active), shareable settings link, fullscreen.

## Keys
`H` hide panel · `R` surprise · `D` Auto-DJ · `F` fullscreen · `S` save PNG

Drag to rotate, scroll or pinch to zoom, click a sphere to override its scale, shape and colours. Settings persist in `localStorage`; "Reset instellingen" clears them. Auto-quality lowers resolution when FPS stays below 30.

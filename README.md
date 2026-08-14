# Metallic Vis — JavaScript Three.js

Static JavaScript/Three.js version of the emissive dissolve visualizer.

## Architecture

This version intentionally does not use Vite, TypeScript, Tailwind, npm, or a build step.

- `index.html` — page and browser import map
- `style.css` — all page styling
- `js/main.js` — Three.js dissolve effect, particles, bloom, controls, and audio analysis
- `assets/cubeMap2/` — active six-face background/environment cubemap
- `assets/particle.png` — particle sprite
- `assets/cubeMap1/` — alternate original cubemap

Three.js and Tweakpane are loaded as browser ES modules from jsDelivr.

## GitHub Pages

Because this repo is already static, use GitHub Pages **Deploy from a branch**:

1. Repository → Settings → Pages.
2. Build and deployment → Source → `Deploy from a branch`.
3. Branch → `main`.
4. Folder → `/(root)`.
5. Save.

No GitHub Actions workflow or `dist` directory is required.

## Background

The active background is the cubemap in `assets/cubeMap2/`:

- `posx.png`
- `negx.png`
- `posy.png`
- `negy.png`
- `posz.png`
- `negz.png`

Replace those six images while preserving their filenames to change the environment/background without editing JavaScript.

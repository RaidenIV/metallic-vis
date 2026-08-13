# Metal Sphere Visualizer

A fully static, GitHub Pages-ready Three.js audio visualizer built around a metallic shader-driven sphere.

## Features

- Local audio file loading and drag/drop
- Web Audio API FFT analysis
- Independent bass, mids, and treble response controls
- Shader-based spherical displacement
- Beat-reactive global impulses
- Multiple audio propagation modes
- Metallic/chrome-style custom shader shading
- Bloom post-processing with toggle and controls
- OrbitControls mouse/touch camera interaction
- Auto-rotation and camera reset
- JSON preset import/export
- Responsive desktop/mobile UI
- No backend and no build step

## Run locally

Because the project uses ES modules, serve it from a local HTTP server rather than opening `index.html` directly.

### Python

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

### VS Code

You can also use the Live Server extension.

## Deploy to GitHub Pages

1. Create a new GitHub repository.
2. Upload/push the contents of this folder to the repository root.
3. Make sure your default branch is `main`.
4. Open **Settings → Pages** in the GitHub repository.
5. Under **Build and deployment**, choose **GitHub Actions**.
6. Push to `main`. The included `.github/workflows/pages.yml` workflow will deploy the site.
7. After deployment, GitHub will show the published Pages URL.

For a repository named `metal-sphere-visualizer`, the URL will normally be:

```text
https://YOUR-USERNAME.github.io/metal-sphere-visualizer/
```

## Notes

- All project asset paths are relative so the visualizer works correctly from a GitHub Pages repository subpath.
- User-selected audio remains local in the browser; audio files are not uploaded anywhere.
- Three.js is loaded from jsDelivr through an import map, so the deployed site needs an internet connection to load Three.js and its addons.

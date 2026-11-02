# Sidali DitherLab

**Every Pixel, Perfected.**

Sidali DitherLab is a private, browser-based tool for creating monochrome, transparent Floyd–Steinberg dithering from your images. Import, adjust, compare, and export without sending image data to a server.

![Sidali DitherLab social preview](./assets/social-preview.png)

![Sidali DitherLab dark editor](./assets/screenshots/editor-dark.png)

[Live demo](https://sidalikharef.github.io/js-image-dithering-converter-and-compression/)

## Editor screenshots

| Dark editor | Light editor |
|---|---|
| ![Dark editor](./assets/screenshots/editor-dark.png) | ![Light editor](./assets/screenshots/editor-light.png) |

| Before and after | Mobile editor |
|---|---|
| ![Compare view](./assets/screenshots/compare-view.png) | ![Mobile editor](./assets/screenshots/mobile-editor.png) |

The included [sample artwork](./assets/sample-art.png) is an original vector illustration created for the project and rasterized from [its SVG source](./assets/sample-art.svg). Screenshots are captures of the running application.

## Features

- Import by file picker or drag and drop. Inputs are limited to 40 MiB and 50 megapixels.
- Adjust output width, pixel size, black threshold, contrast, diffusion strength, and WebP quality.
- Preview the processed output, original, or a draggable before/after comparison.
- Zoom in and out, or fit the preview to the available canvas area.
- Undo and redo adjustment changes; reset settings to their defaults.
- Inspect output dimensions and actual encoded WebP size before downloading.
- Keep black pixels opaque and make white pixels transparent.
- Process images locally in the browser; no image upload, account, or runtime dependency.
- Switch between dark and light editor themes.

## Getting started

The app uses JavaScript modules, so serve the project over HTTP instead of opening `index.html` directly:

```sh
python3 -m http.server 8000
```

Open [http://localhost:8000](http://localhost:8000) in a modern browser.

## Processing

The source is resized to the requested output dimensions while preserving its aspect ratio. The app reduces the image to a logical grid based on the pixel-size setting, applies Floyd–Steinberg error diffusion, and scales the result back to the requested dimensions using nearest-neighbor interpolation.

For each logical pixel, luminance is adjusted by the contrast setting and quantized to black or transparent at the selected threshold. Quantization error is distributed to the right (7/16), bottom-left (3/16), below (5/16), and bottom-right (1/16). Calculations use a `Float32Array` so fractional error is retained rather than clamped during processing. The diffusion-strength setting scales the amount of error propagated.

Fully transparent source pixels are composited against white for luminance calculation. The output contains opaque black pixels or fully transparent pixels; it does not create partially transparent dots.

## Export

Export uses the browser Canvas API to encode WebP. The app checks the returned blob MIME type and reports an error instead of labeling a different format as WebP when encoding is unavailable. The displayed file size is the encoded blob's actual size.

The 30 KiB indicator is a target, not a guarantee. File size depends on image content, dimensions, grain pattern, and browser encoder. The quality control changes encoder quality but cannot guarantee a particular file size.

## Development

The project has no installed dependencies or build step. Run its tests and syntax checks with Node.js:

```sh
npm test
npm run check
```

The core functions in `core.mjs` do not depend on browser APIs and are covered by Node's built-in test runner.

## Current limitations

- Floyd–Steinberg is the only implemented dithering algorithm.
- Export is WebP only; supported formats depend on the browser's Canvas encoder.
- Image processing runs on the main thread. Very large images may take time and browser canvas limits may apply.
- This repository remains a small, dependency-free JavaScript application; a TypeScript/pnpm monorepo, CLI, React package, batch tools, and offline/PWA support are not implemented.

## Project structure

```text
.
├── assets/
│   ├── dither-orbit.svg
│   ├── dither-orbit-light.svg
│   ├── dither-orbit-lockup-dark.svg
│   ├── dither-orbit-lockup-light.svg
│   ├── favicon.svg
│   ├── sample-art.png
│   ├── sample-art.svg
│   ├── social-preview.svg
│   ├── social-preview.png
│   └── screenshots/
│       ├── editor-dark.png
│       ├── editor-light.png
│       ├── compare-view.png
│       └── mobile-editor.png
├── index.html
├── main.js
├── core.mjs
├── styles.css
├── tests/
│   └── core.test.mjs
├── package.json
├── README.md
└── LICENSE
```

## License and attribution

Released under the MIT License. See [LICENSE](./LICENSE). The application currently declares no third-party runtime dependencies.

## Author

Built by [Sidali Kharef](https://github.com/sidalikharef).

[Website](https://sidalikharef.cc/)

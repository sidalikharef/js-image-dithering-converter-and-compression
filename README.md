# Sidali DitherLab

<div align="center">

<img src="./assets/dither-orbit.svg" alt="Sidali DitherLab Logo" width="100" />

# Every Pixel, Perfected.

**A modern, open-source monochrome and full-color image-processing studio.**

Transform images into monochrome or palette-based pixel artwork with precision controls, custom palettes, real-time comparisons, and privacy-first processing.

[**🚀 Live Demo**](https://ditterlab.sidalikharef.cc) · [**🌐 Portfolio**](https://sidalikharef.cc) · [**💻 GitHub**](https://github.com/sidalikharef)

![License](https://img.shields.io/badge/License-MIT-B6F36B?style=flat-square)
![JavaScript](https://img.shields.io/badge/JavaScript-ES_Modules-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![Status](https://img.shields.io/badge/Status-Active_Development-B6F36B?style=flat-square)
![Dependencies](https://img.shields.io/badge/Runtime_Dependencies-0-171A1C?style=flat-square)

</div>

---

![Sidali DitherLab Social Preview](./assets/social-preview.png)

## ✨ Overview

**Sidali DitherLab** is a lightweight, privacy-first image-processing application built with vanilla JavaScript, HTML, and CSS. Its reusable engine supports monochrome output and full-color palette dithering without uploading images or palettes.

It provides nine monochrome and full-color dithering algorithms, six monochrome presets and eight color presets, algorithm/palette comparisons, adjustable processing controls, and WebP optimization.

Everything runs locally in your browser. Your images are processed on your device without being uploaded to a server.

Designed for developers, digital artists, designers, and anyone interested in experimental image processing.

### 🌐 Try It Online

**[Launch Sidali DitherLab →](https://ditterlab.sidalikharef.cc)**

No installation, account, or image upload to a server required.

## 📸 Screenshots

### Professional Editor — Dark Theme

![Sidali DitherLab Dark Editor](./assets/screenshots/editor-dark.png)

### Light Theme

![Sidali DitherLab Light Editor](./assets/screenshots/editor-light.png)

### Before & After Comparison

![Sidali DitherLab Compare View](./assets/screenshots/compare-view.png)

### Responsive Mobile Experience

![Sidali DitherLab Mobile Editor](./assets/screenshots/mobile-editor.png)

### Algorithm Comparison

![Sidali DitherLab algorithm comparison](./assets/screenshots/algorithm-comparison.png)

### Color Palette Studio

![Sidali DitherLab color studio](./assets/screenshots/color-studio.png)

### Game Boy Palette

![Sidali DitherLab Game Boy palette](./assets/screenshots/gameboy-palette.png)

### Custom Palette Editor

![Sidali DitherLab custom palette editor](./assets/screenshots/custom-palette.png)

### Palette Comparison

![Sidali DitherLab palette comparison](./assets/screenshots/palette-comparison.png)

### Mobile Color Studio

![Sidali DitherLab mobile color studio](./assets/screenshots/mobile-color-studio.png)

> The screenshots were captured from the actual running application using original sample artwork included in this repository.

## ⚡ Features

### 🎨 Image Processing

- **Nine algorithms:** Floyd–Steinberg, Atkinson, Jarvis–Judice–Ninke, Stucki, Burkes, Sierra, Sierra Lite, Bayer Ordered, and Seeded Random.
- **Algorithm selector:** Algorithms are grouped by error-diffusion, ordered, and stochastic families, with descriptions and relevant controls.
- **Algorithm-specific controls:** Error-diffusion strength and optional serpentine scan; Bayer 2×2, 4×4, and 8×8 matrices and ordered strength; seeded random value and randomness strength.
- **Built-in presets:** Classic Mono, Retro Macintosh, Newspaper Texture, Soft Diffusion, Sharp Pixel Mono, and Experimental Noise.
- **Algorithm comparison:** Render two algorithms from the same original image at a bounded preview resolution and apply either result to the editor.
- **Processing metrics:** Actual algorithm time, separate WebP encoding duration, output dimensions, and encoded file size.
- **Color metrics:** Current mode, palette and color count, matching metric, and the measured duration of the most recent extraction.
- **Adjustable output dimensions:** Resize images while preserving their aspect ratio.
- **Pixel-size control:** Create fine-grained dithering or bold pixelated styles.
- **Black threshold:** Control the balance between black and transparent pixels.
- **Contrast adjustment:** Fine-tune image detail before quantization.
- **Diffusion strength:** Adjust how quantization error spreads between pixels.
- **Transparency support:** Generate opaque black pixels on a transparent background.
- **Full-color mode:** Quantize original image pixels to a selected palette using Floyd–Steinberg, Atkinson, Jarvis–Judice–Ninke, Stucki, Burkes, Sierra, Sierra Lite, Bayer, or seeded random dithering.
- **Palette library:** Browse 19 built-in palettes in Classic, Retro Computing, Artistic, and Technical categories, including Game Boy Classic, CGA, Commodore 64, PICO-8, RGB332, and Web-safe.
- **Color matching:** Choose RGB — Fast, Linear RGB — Light-aware, or CIELAB ΔE76 — Perceptual. These are explicit distance measures, not claims of universally optimal perception.
- **Palette editing:** Create, name, duplicate, reorder, edit HEX or native color values, and add or remove unique colors. Custom palettes support 2–256 colors, JSON import/export, and versioned localStorage persistence.
- **Palette extraction:** Generate local palettes with deterministic Median Cut or seeded K-Means from a bounded representative sample of up to 50,000 visible pixels.
- **Color adjustments:** Apply brightness, contrast, saturation, gamma, exposure, hue, temperature, and tint non-destructively to the decoded source before quantization.
- **Alpha handling:** Preserve source alpha, composite onto a chosen background, or emit opaque palette-mapped pixels. Fully transparent pixels are excluded from preserved-mode diffusion.
- **Color presets:** Game Boy Classic, Retro CGA, 1-Bit Newspaper, PICO-8 Pixel Art, Warm Duotone, Sunset Dither, Adaptive 8-Color, and High-Contrast Poster.
- **Palette comparison:** Compare algorithm and palette combinations from the same original; choose the same algorithm with two palettes or different algorithms with a shared palette.

### 🖥️ Professional Editor

- Modern Graphite + Electric Lime interface.
- Dark and light themes.
- Image upload through file picker or drag and drop.
- Interactive original/output comparison slider.
- Original, processed, and comparison views.
- Zoom in, zoom out, and fit-to-screen controls.
- Undo and redo adjustment changes.
- Reset settings to defaults.
- Responsive layouts for desktop and mobile.

### 📦 Image Optimization

- WebP image export.
- Adjustable WebP quality.
- Actual encoded file-size reporting.
- Output dimension information.
- Browser-based image processing.
- No third-party runtime dependencies.

### 🔒 Privacy First

- No account required.
- No server-side image processing.
- No image uploads.
- No mandatory cloud services.
- Image processing happens in the browser.

**Input limits:** 40 MiB per file and 50 megapixels.

## 🚀 Getting Started

### Option 1 — Use the Online Studio

Open the live application:

**https://ditterlab.sidalikharef.cc**

Upload an image, adjust the dithering parameters, compare the result, and export your optimized artwork.

### Option 2 — Run Locally

Clone the repository:

```bash
git clone https://github.com/sidalikharef/js-image-dithering-converter-and-compression.git
```

Navigate into the project:

```bash
cd js-image-dithering-converter-and-compression
```

Start a local development server:

```bash
python3 -m http.server 8000
```

Open:

**http://localhost:8000**

Because the application uses native JavaScript ES modules, it must be served over HTTP rather than opened directly through the `file://` protocol.

No `npm install`, build process, or external runtime dependencies are required to run the web application.

## 🧠 How Dithering Works

Sidali DitherLab always processes the decoded original image rather than feeding a previous dithered output back into the engine:

The processing pipeline follows these steps:

1. Resize the original image to the requested output dimensions while preserving its aspect ratio.
2. Reduce the image to a logical pixel grid.
3. Calculate pixel luminance and apply contrast.
4. Quantize each pixel into black or transparent with the selected algorithm.
5. Apply the selected error-diffusion kernel, Bayer ordered threshold matrix, or seeded stochastic threshold.
6. Scale the result using nearest-neighbor interpolation.
7. Encode the final image as WebP.

### Error Diffusion Matrix

Error-diffusion kernels include Floyd–Steinberg (16), Atkinson (6/8 propagated error), Jarvis–Judice–Ninke (48), Stucki (42), Burkes (32), Sierra (32), and Sierra Lite (4). Optional serpentine scanning mirrors horizontal kernel offsets on alternate rows.

The Floyd–Steinberg kernel distributes error according to:

```text
             X    7/16
    3/16    5/16  1/16
```

Where `X` represents the currently processed pixel.

Fractional error is preserved using a `Float32Array`, preventing premature clamping during diffusion.

The diffusion-strength setting controls how much error is propagated. Bayer uses a repeating 2×2, 4×4, or 8×8 threshold matrix; its ordered-strength control blends to ordinary thresholding at zero. Seeded Random uses a deterministic PRNG, so the same input and seed reproduce the same output.

Fully transparent source pixels are composited against white for luminance calculations.

The resulting image contains opaque black pixels and fully transparent pixels, without partially transparent dots.

## 🌈 Full-Color Palette Studio

Switch **Processing mode** to **Full color** to use an independent RGB palette pipeline. The selected algorithm maps each adjusted source pixel directly to an exact palette entry; error diffusion operates on floating-point RGB channel errors, while palette matching uses the independently selected RGB, linear-light RGB, or CIELAB ΔE76 metric. RGB Euclidean distance uses gamma-encoded 8-bit channel values; Linear RGB uses normalized linear-light sRGB; Lab distance is Euclidean ΔE76 with sRGB converted to CIELAB using the D65 reference white and 2° standard observer. Thus the selected matching space is never confused with the RGB space used by the diffusion kernels.

Color Bayer adds a repeating, zero-mean spatial RGB offset before palette matching. Strength zero is plain palette quantization. Seeded Random applies deterministic shared-channel noise before matching; zero strength is also plain quantization. The seven error-diffusion algorithms retain their existing kernels and optional serpentine scanning. No CSS filter is used as a processing substitute.

Built-in Commodore 64 colors use the common Pepto RGB palette variant; CGA uses the classic 16-entry RGBI color set assembled across display modes. The Game Boy Classic palette is a DMG-inspired four-tone set. Artistic palette colors are original selections. Palette matching can produce only the palette colors; preserved fully transparent pixels remain transparent. Partial alpha is retained in Preserve mode. Composite mode blends against the selected background in sRGB code values before adjustments; Opaque mode uses that same background for transparent portions and emits opaque pixels. Hidden RGB values in fully transparent pixels are therefore ignored in both modes.

Color adjustments are applied to a fresh sample of the original on every render, in this order: decode sRGB to linear RGB; apply exposure; apply contrast and brightness; adjust saturation; rotate hue; apply temperature and tint offsets; apply gamma; encode back to sRGB; then evaluate the selected palette distance. Brightness and temperature/tint ranges are normalized offsets; exposure uses EV stops; hue is degrees; gamma is a positive exponent control. Adjustments never modify the uploaded image.

The palette library is local and versioned. User-created palettes are stored under `sidali-ditherlab:custom-palettes:v1` in the current browser profile. Palette imports use a bounded, versioned JSON schema and are treated as data only. No image or palette information is sent to a service.

Median Cut splits sampled boxes by the largest channel range and uses each box's mean. K-Means uses seeded initialization, a bounded iteration count, and sampled RGB pixels; it is deterministic for fixed inputs and settings but does not guarantee a globally optimal palette. Fully transparent pixels are excluded from extraction. Uniform or limited-color images may yield fewer colors than requested.

## 📤 Export and Compression

Images are encoded through the browser Canvas API using WebP.

Monochrome controls include:

- Output width.
- Pixel size.
- WebP quality.
- Contrast.
- Threshold.
- Diffusion strength.

The application validates the encoded blob's MIME type to avoid incorrectly labeling an unsupported format as WebP.

The reported output size is based on the actual encoded blob.

**Note:** The 30 KiB indicator is a target, not a guaranteed output size. Compression efficiency depends on source content, dimensions, dithering patterns, and browser encoding behavior.

## 🏗️ Project Structure

```text
sidali-ditherlab/
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
│       ├── mobile-editor.png
│       ├── algorithm-comparison.png
│       ├── color-studio.png
│       ├── gameboy-palette.png
│       ├── custom-palette.png
│       ├── palette-comparison.png
│       └── mobile-color-studio.png
├── tests/
│   ├── fixtures/
│   ├── core.test.mjs
│   ├── engine.test.mjs
│   └── color.test.mjs
├── benchmarks/
│   ├── algorithms.mjs
│   └── color-processing.mjs
├── src/
│   └── engine/
│       ├── algorithms/
│       ├── color/
│       ├── palettes/
│       ├── utilities/
│       ├── history.mjs
│       ├── presets.mjs
│       ├── registry.mjs
│       └── validation.mjs
├── index.html
├── main.js
├── core.mjs
├── styles.css
├── package.json
├── README.md
└── LICENSE
```

## 🧪 Development and Testing

The application uses native JavaScript modules and Node.js's built-in testing tools.

Run the test suite:

```bash
npm test
```

Run syntax checks:

```bash
npm run check
```

The legacy Floyd–Steinberg API remains in `core.mjs` for compatibility. The modular engine in `src/engine` is independent of browser APIs and is tested with Node.js fixtures.

Run the deterministic median benchmark for all algorithms at 256×256, 512×512, and 1024×1024:

```bash
npm run benchmark
```

The benchmark runs one warm-up and three measured iterations per case; it prints measurements from the current machine and does not encode or assert performance claims.

Run color processing and extraction benchmarks:

```bash
npm run benchmark:color
```

This reports median timings for RGB, linear RGB, and Lab image quantization; color Floyd–Steinberg, Atkinson, and Bayer; and sample-bounded Median Cut and K-Means. Extraction uses at most 50,000 sampled visible pixels. Timings are local observations, not performance guarantees.

## 🗺️ Roadmap

Sidali DitherLab is actively evolving into a more comprehensive open-source image-processing toolkit.

The following larger product features remain planned and are not part of this browser-only phase.

### Future Processing Features

- [x] Custom color palettes and full-color dithering.
- [x] Retro Game Boy-style color processing.
- [ ] Additional creative image effects.

### Future Performance and Optimization

- [ ] Web Worker processing.
- [ ] Batch image conversion.
- [ ] Additional export formats.
- [ ] Improved image compression.

### Future Developer Toolkit

- [ ] TypeScript processing library.
- [ ] NPM package.
- [ ] Command-line interface.
- [ ] React integration.
- [ ] Dedicated documentation.
- [ ] Monorepo architecture.

### Future Sidali AutoLab

**An experimental, local-first autonomous image-processing assistant.**

Planned capabilities include:

- [ ] Natural-language image-processing instructions.
- [ ] Automatic dithering-parameter exploration.
- [ ] Intelligent palette recommendations.
- [ ] Automated compression experiments.
- [ ] Visual quality evaluation.
- [ ] Multi-candidate comparison.
- [ ] Local AI model integration.
- [ ] Optimization workflows without mandatory paid AI APIs.

The long-term goal is to let users describe a desired visual result and have AutoLab explore suitable configurations automatically.

## ⚠️ Current Limitations

- Processing runs on the browser's main thread; large images can temporarily block interactions.
- Full-color image processing is CPU-intensive, especially with larger palettes and Lab matching; benchmark figures are machine-dependent.
- Color calculations assume sRGB channel values and do not preserve embedded ICC profiles or guarantee color-managed output across browsers.
- WebP encoding uses the browser's Canvas encoder and configured lossy quality; decoded exports can differ slightly from exact palette RGB values even though the processing buffer and preview use only selected palette entries.
- Algorithm comparison caps the rendered preview's longest side at 512 pixels to keep comparisons responsive.
- WebP is the only export format.
- Large images may take additional processing time.
- Browser Canvas limits and encoder support vary.
- Comparison previews are bounded to 512 pixels on their longest edge; exported output retains the configured full dimensions.
- Batch processing, CLI tools, TypeScript packages, and AI features are not yet available.
- Offline PWA support is not implemented.

## 🤝 Contributing

Contributions, bug reports, feature ideas, and improvements are welcome.

You can participate by opening a GitHub issue, suggesting a new dithering algorithm, reporting a processing bug, or proposing improvements to the editor.

Please keep changes focused, document behavioral changes, and run the available tests before submitting a pull request.

**[View the repository on GitHub](https://github.com/sidalikharef/js-image-dithering-converter-and-compression)**

## 📄 License

Sidali DitherLab is released under the **MIT License**.

See [LICENSE](./LICENSE) for the complete license terms and copyright notices.

The current application declares no third-party runtime dependencies.

## 👨‍💻 Author

**Sidali Kharef**

Software Developer & Open-Source Enthusiast

Creator and maintainer of Sidali DitherLab.

| Platform | Link |
|---|---|
| 🌐 Portfolio | [sidalikharef.cc](https://sidalikharef.cc) |
| 💻 GitHub | [github.com/sidalikharef](https://github.com/sidalikharef) |
| 💼 LinkedIn | [Sid Ali Kharef](https://www.linkedin.com/in/sid-ali-kharef-b5195419b/) |
| 🚀 Live Application | [ditterlab.sidalikharef.cc](https://ditterlab.sidalikharef.cc) |

---

<div align="center">

### Every Pixel, Perfected.

Built with JavaScript, creativity, and a passion for image processing.

**[Live Demo](https://ditterlab.sidalikharef.cc)** · **[Portfolio](https://sidalikharef.cc)** · **[GitHub](https://github.com/sidalikharef)** · **[LinkedIn](https://www.linkedin.com/in/sid-ali-kharef-b5195419b/)**

**Open Source · MIT Licensed · Privacy First**

</div>
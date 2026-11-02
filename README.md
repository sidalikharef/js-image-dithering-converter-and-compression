# Sidali DitherLab

<div align="center">

<img src="./assets/dither-orbit.svg" alt="Sidali DitherLab Logo" width="100" />

# Every Pixel, Perfected.

**A modern, open-source image dithering and optimization studio.**

Transform images into beautiful monochrome, pixelated artwork with precision controls, real-time comparisons, and privacy-first processing.

[**🚀 Live Demo**](https://ditterlab.sidalikharef.cc) · [**🌐 Portfolio**](https://sidalikharef.cc) · [**💻 GitHub**](https://github.com/sidalikharef)

![License](https://img.shields.io/badge/License-MIT-B6F36B?style=flat-square)
![JavaScript](https://img.shields.io/badge/JavaScript-ES_Modules-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![Status](https://img.shields.io/badge/Status-Active_Development-B6F36B?style=flat-square)
![Dependencies](https://img.shields.io/badge/Runtime_Dependencies-0-171A1C?style=flat-square)

</div>

---

![Sidali DitherLab Social Preview](./assets/social-preview.png)

## ✨ Overview

**Sidali DitherLab** is a lightweight, privacy-first image-processing application built with vanilla JavaScript, HTML, and CSS.

It provides precise Floyd–Steinberg dithering with adjustable output settings, interactive image comparisons, and WebP optimization.

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

> The screenshots were captured from the actual running application using original sample artwork included in this repository.

## ⚡ Features

### 🎨 Image Processing

- **Floyd–Steinberg dithering:** Convert images into detailed monochrome artwork using error diffusion.
- **Adjustable output dimensions:** Resize images while preserving their aspect ratio.
- **Pixel-size control:** Create fine-grained dithering or bold pixelated styles.
- **Black threshold:** Control the balance between black and transparent pixels.
- **Contrast adjustment:** Fine-tune image detail before quantization.
- **Diffusion strength:** Adjust how quantization error spreads between pixels.
- **Transparency support:** Generate opaque black pixels on a transparent background.

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

Sidali DitherLab currently uses the **Floyd–Steinberg error-diffusion algorithm**.

The processing pipeline follows these steps:

1. Resize the original image to the requested output dimensions while preserving its aspect ratio.
2. Reduce the image to a logical pixel grid.
3. Calculate pixel luminance and apply contrast.
4. Quantize each pixel into black or transparent.
5. Distribute quantization error to neighboring pixels.
6. Scale the result using nearest-neighbor interpolation.
7. Encode the final image as WebP.

### Error Diffusion Matrix

The Floyd–Steinberg algorithm distributes error according to the following pattern:

```text
             X    7/16
    3/16    5/16  1/16
```

Where `X` represents the currently processed pixel.

Fractional error is preserved using a `Float32Array`, preventing premature clamping during diffusion.

The diffusion-strength setting controls how much error is propagated.

Fully transparent source pixels are composited against white for luminance calculations.

The resulting image contains opaque black pixels and fully transparent pixels, without partially transparent dots.

## 📤 Export and Compression

Images are encoded through the browser Canvas API using WebP.

Available controls include:

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
│       └── mobile-editor.png
├── screenshots/
│   └── application.png
├── tests/
│   └── core.test.mjs
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

The processing functions in `core.mjs` are independent of browser APIs and covered by automated unit tests.

The last reported verification completed **10 passing core tests**, along with JavaScript syntax checks and browser smoke tests.

## 🗺️ Roadmap

Sidali DitherLab is actively evolving into a more comprehensive open-source image-processing toolkit.

The following features are **planned and not yet implemented**.

### Phase 1 — Advanced Dithering

- [ ] Atkinson dithering.
- [ ] Bayer ordered dithering.
- [ ] Jarvis–Judice–Ninke.
- [ ] Stucki, Burkes, and Sierra algorithms.
- [ ] Custom color palettes.
- [ ] Retro Game Boy-style color processing.
- [ ] Additional creative image effects.

### Phase 2 — Performance and Optimization

- [ ] Web Worker processing.
- [ ] Batch image conversion.
- [ ] Additional export formats.
- [ ] Improved image compression.
- [ ] Performance benchmarks.
- [ ] Reusable processing pipelines.

### Phase 3 — Developer Toolkit

- [ ] TypeScript processing library.
- [ ] NPM package.
- [ ] Command-line interface.
- [ ] React integration.
- [ ] Dedicated documentation.
- [ ] Monorepo architecture.

### Phase 4 — Sidali AutoLab

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

- Floyd–Steinberg is currently the only supported dithering algorithm.
- WebP is the only export format.
- Processing runs on the browser's main thread.
- Large images may take additional processing time.
- Browser Canvas limits and encoder support vary.
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
/** Pure image operations. No browser dependencies. */
export function outputDimensions(sourceWidth, sourceHeight, targetWidth) {
  if (![sourceWidth, sourceHeight, targetWidth].every(n => Number.isFinite(n) && n > 0)) {
    throw new RangeError('Image dimensions must be positive finite numbers');
  }
  const width = Math.round(targetWidth);
  const height = Math.round(sourceHeight * width / sourceWidth);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new RangeError('Output dimensions are outside the supported range');
  }
  return {width, height};
}

export function processingDimensions(outputWidth, outputHeight, grainSize) {
  if (![outputWidth, outputHeight, grainSize].every(Number.isSafeInteger)
    || outputWidth < 1 || outputHeight < 1 || grainSize < 1) {
    throw new RangeError('Output dimensions and grain size must be positive integers');
  }
  return {
    width: Math.max(1, Math.ceil(outputWidth / grainSize)),
    height: Math.max(1, Math.ceil(outputHeight / grainSize))
  };
}

/**
 * Floyd-Steinberg diffusion using an unclamped floating-point luminance buffer.
 * Returns RGBA pixels: black or fully transparent (never white).
 * The source's alpha is composited against white, so transparent areas remain clear.
 */
export function ditherToTransparentBlack({data, width, height}, {threshold = 128, contrast = 1, strength = 1} = {}) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
    || !data || data.length !== width * height * 4) {
    throw new RangeError('Invalid RGBA input');
  }
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 255) {
    throw new RangeError('Threshold must be between 0 and 255');
  }
  if (!Number.isFinite(contrast) || contrast < 0) {
    throw new RangeError('Contrast must be a non-negative finite number');
  }
  if (!Number.isFinite(strength) || strength < 0 || strength > 1) {
    throw new RangeError('Diffusion strength must be between 0 and 1');
  }

  const n = width * height;
  const gray = new Float32Array(n);
  const output = new Uint8ClampedArray(n * 4);
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    const a = data[i + 3] / 255;
    const lum = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) * a + 255 * (1 - a);
    gray[p] = (lum - 128) * contrast + 128;
  }
  const add = (x, y, amount) => {
    if (x >= 0 && x < width && y >= 0 && y < height) gray[y * width + x] += amount;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const value = gray[p];
      const black = value < threshold;
      const quantized = black ? 0 : 255;
      const i = p * 4;
      output[i] = output[i + 1] = output[i + 2] = 0;
      output[i + 3] = black ? 255 : 0;
      const error = (value - quantized) * strength;
      // Distribute the quantization error to unprocessed neighbors.
      add(x + 1, y, error * 7 / 16);
      add(x - 1, y + 1, error * 3 / 16);
      add(x, y + 1, error * 5 / 16);
      add(x + 1, y + 1, error / 16);
    }
  }
  return {data: output, width, height};
}

export function formatBytes(bytes) {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KiB`;
}

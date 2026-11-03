export function luminanceBuffer({data, width, height}, contrast = 1) {
  const count = width * height;
  const luminance = new Float32Array(count);
  for (let pixel = 0, offset = 0; pixel < count; pixel++, offset += 4) {
    const alpha = data[offset + 3] / 255;
    const gray = (0.2126 * data[offset] + 0.7152 * data[offset + 1] + 0.0722 * data[offset + 2]) * alpha + 255 * (1 - alpha);
    luminance[pixel] = (gray - 128) * contrast + 128;
  }
  return luminance;
}

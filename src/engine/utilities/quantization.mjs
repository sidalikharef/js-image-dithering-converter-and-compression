export function writeBinaryPixel(output, pixel, isBlack) {
  const offset = pixel * 4;
  output[offset] = 0;
  output[offset + 1] = 0;
  output[offset + 2] = 0;
  output[offset + 3] = isBlack ? 255 : 0;
}

export function isBelowThreshold(value, threshold) {
  return value < threshold;
}

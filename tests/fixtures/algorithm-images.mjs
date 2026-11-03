export function makeGradientFixture(width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = Math.round((x + y * width) * 255 / Math.max(1, width * height - 1));
      const offset = (y * width + x) * 4;
      data[offset] = data[offset + 1] = data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  return {data, width, height};
}

export function makeTransparencyFixture() {
  return {
    width: 4,
    height: 2,
    data: new Uint8ClampedArray([
      0, 0, 0, 255, 75, 75, 75, 255, 130, 130, 130, 255, 255, 255, 255, 255,
      0, 0, 0, 0, 40, 100, 180, 96, 220, 220, 220, 255, 16, 16, 16, 255
    ])
  };
}

import {validateImageData, validateOptions} from '../validation.mjs';

const BAYER_2 = [[0, 2], [3, 1]];
const BAYER_4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const BAYER_8 = [[0, 48, 12, 60, 3, 51, 15, 63], [32, 16, 44, 28, 35, 19, 47, 31], [8, 56, 4, 52, 11, 59, 7, 55], [40, 24, 36, 20, 43, 27, 39, 23], [2, 50, 14, 62, 1, 49, 13, 61], [34, 18, 46, 30, 33, 17, 45, 29], [10, 58, 6, 54, 9, 57, 5, 53], [42, 26, 38, 22, 41, 25, 37, 21]];
const BAYER_TABLES = Object.freeze({2: BAYER_2, 4: BAYER_4, 8: BAYER_8});

export function getBayerMatrix(size) {
  const matrix = BAYER_TABLES[size];
  if (!matrix) throw new RangeError('Bayer matrix size must be 2, 4, or 8.');
  return matrix.map(row => [...row]);
}

export const bayer = (image, settings) => {
  validateImageData(image);
  const options = validateOptions({ ...settings, matrixSize: settings?.matrixSize ?? 4, orderedStrength: settings?.orderedStrength ?? 1 });
  const {width, height, data} = image;
  const table = BAYER_TABLES[options.matrixSize];
  const output = new Uint8ClampedArray(data.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const alpha = data[offset + 3] / 255;
      const luminance = (0.2126 * data[offset] + 0.7152 * data[offset + 1] + 0.0722 * data[offset + 2]) * alpha + 255 * (1 - alpha);
      const adjusted = ((luminance - 128) * options.contrast + 128);
      const matrixValue = table[y % options.matrixSize][x % options.matrixSize];
      const normalized = (matrixValue + 1) / (options.matrixSize * options.matrixSize + 1);
      const threshold = options.threshold + (normalized - 0.5) * 255 * options.orderedStrength;
      const black = adjusted < threshold;

      output[offset] = 0;
      output[offset + 1] = 0;
      output[offset + 2] = 0;
      output[offset + 3] = black ? 255 : 0;
    }
  }

  return {data: output, width, height};
};

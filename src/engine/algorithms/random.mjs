import {createSeededRandom} from '../utilities/seeded-random.mjs';
import {validateImageData, validateOptions} from '../validation.mjs';

export const randomDither = (image, settings) => {
  validateImageData(image);
  const options = validateOptions({ ...settings, randomness: settings?.randomness ?? 1, seed: settings?.seed ?? 1 });
  const {data, width, height} = image;
  const output = new Uint8ClampedArray(data.length);
  const random = createSeededRandom(options.seed);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const alpha = data[offset + 3] / 255;
      const luminance = (0.2126 * data[offset] + 0.7152 * data[offset + 1] + 0.0722 * data[offset + 2]) * alpha + 255 * (1 - alpha);
      const contrasted = (luminance - 128) * options.contrast + 128;
      const threshold = options.threshold + (random() - 0.5) * 255 * options.randomness;
      const black = contrasted < threshold;

      output[offset] = 0;
      output[offset + 1] = 0;
      output[offset + 2] = 0;
      output[offset + 3] = black ? 255 : 0;
    }
  }

  return {data: output, width, height};
};

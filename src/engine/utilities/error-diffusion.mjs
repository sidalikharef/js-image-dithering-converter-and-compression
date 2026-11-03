import {luminanceBuffer} from './luminance.mjs';
import {writeBinaryPixel, isBelowThreshold} from './quantization.mjs';
import {validateImageData, validateOptions} from '../validation.mjs';

export function diffuseError(image, settings, kernel) {
  validateImageData(image);
  const options = validateOptions(settings);
  const {width, height, data} = image;
  const luminance = luminanceBuffer(image, options.contrast);
  const output = new Uint8ClampedArray(data.length);

  for (let y = 0; y < height; y++) {
    const reverse = options.serpentine && (y & 1) === 1;
    const start = reverse ? width - 1 : 0;
    const end = reverse ? -1 : width;
    const step = reverse ? -1 : 1;

    for (let x = start; x !== end; x += step) {
      const index = y * width + x;
      const value = luminance[index];
      const black = isBelowThreshold(value, options.threshold);

      writeBinaryPixel(output, index, black);
      const error = (value - (black ? 0 : 255)) * options.strength;

      for (const [offsetX, offsetY, weight] of kernel.offsets) {
        const targetX = reverse ? x - offsetX : x + offsetX;
        const targetY = y + offsetY;
        if (targetX < 0 || targetX >= width || targetY < 0 || targetY >= height) continue;
        const targetIndex = targetY * width + targetX;
        luminance[targetIndex] += (error * weight) / kernel.denominator;
      }
    }
  }

  return {data: output, width, height};
}

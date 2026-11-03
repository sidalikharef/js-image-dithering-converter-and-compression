import {nearestPaletteIndex, preparePalette} from './color-distance.mjs';
import {validateRGB} from './color-space.mjs';

export function quantizeColor(rgb, palette, options = {}) {
  validateRGB(rgb);
  const prepared = options.preparedPalette ?? preparePalette(palette, options.method ?? 'rgb');
  const index = nearestPaletteIndex(rgb, prepared);
  return prepared.colors[index].slice();
}

export function quantizeImage(image, palette, options = {}) {
  const {data, width, height} = image ?? {};
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || data?.length !== width * height * 4) {
    throw new RangeError('Invalid RGBA image buffer.');
  }
  if(!Array.isArray(palette)||palette.length<2||palette.length>256)throw new RangeError('Palette quantization requires 2–256 colors.');
  const prepared = preparePalette(palette, options.method ?? 'rgb');
  const output = new Uint8ClampedArray(data.length);
  const alphaMode = options.alphaMode ?? 'preserve';
  if (!['preserve','composite','opaque'].includes(alphaMode)) throw new RangeError('Unknown alpha mode.');
  const background = options.background ?? [255, 255, 255];
  for (let offset = 0; offset < data.length; offset += 4) {
    const alpha = data[offset + 3] / 255;
    if (alphaMode === 'preserve' && alpha === 0) continue;
    const rgb = alphaMode !== 'preserve'
      ? [0,1,2].map(channel => data[offset + channel] * alpha + background[channel] * (1 - alpha))
      : data.subarray(offset, offset + 3);
    const color = quantizeColor(rgb, prepared.colors, {preparedPalette:prepared});
    output.set(color, offset);
    output[offset + 3] = alphaMode === 'preserve' ? data[offset + 3] : 255;
  }
  return {data:output, width, height};
}

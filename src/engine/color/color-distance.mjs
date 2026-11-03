import {hexToRGB, rgbToLab, rgbToLinearRGB, validateRGB} from './color-space.mjs';

export const COLOR_DISTANCE_METHODS = Object.freeze([
  {id:'rgb', label:'RGB — Fast'},
  {id:'linear-rgb', label:'Linear RGB — Light-aware'},
  {id:'lab76', label:'Lab ΔE76 — Perceptual'}
]);

const transforms = Object.freeze({
  rgb: color => color.slice(0, 3),
  'linear-rgb': rgbToLinearRGB,
  lab76: rgbToLab
});

export function preparePalette(palette, method = 'rgb') {
  if (!Array.isArray(palette) || palette.length < 1) throw new RangeError('A palette must contain at least one color.');
  const transform = transforms[method];
  if (!transform) throw new RangeError(`Unknown color-distance method: ${method}`);
  const colors = palette.map(color => {
    if(typeof color==='string')color=hexToRGB(color);
    validateRGB(color);
    return color.slice(0, 3);
  });
  return Object.freeze({method, colors, points: colors.map(transform)});
}

export function colorDistance(a, b, method = 'rgb') {
  const transform = transforms[method];
  if (!transform) throw new RangeError(`Unknown color-distance method: ${method}`);
  validateRGB(a);
  validateRGB(b);
  const left = transform(a);
  const right = transform(b);
  return Math.sqrt(left.reduce((sum, channel, index) => sum + (channel - right[index]) ** 2, 0));
}

export function nearestPaletteIndex(color, preparedPalette) {
  if ((!Array.isArray(color) && !(color instanceof Uint8Array) && !(color instanceof Uint8ClampedArray))
      || color.length < 3 || ![color[0],color[1],color[2]].every(Number.isFinite)) {
    throw new TypeError('An RGB color with finite channels is required.');
  }
  const transform = transforms[preparedPalette?.method];
  if (!transform || !Array.isArray(preparedPalette.points)) throw new TypeError('A prepared palette is required.');
  const point = transform(color);
  let bestIndex = 0;
  let bestDistance = Infinity;
  for (let index = 0; index < preparedPalette.points.length; index++) {
    const candidate = preparedPalette.points[index];
    let distance = 0;
    for (let channel = 0; channel < 3; channel++) distance += (point[channel] - candidate[channel]) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

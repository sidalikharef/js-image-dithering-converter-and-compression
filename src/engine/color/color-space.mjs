const clampByte = value => Math.min(255, Math.max(0, Math.round(value)));

export function clampChannel(value) {
  if (!Number.isFinite(value)) throw new TypeError('Color channels must be finite numbers.');
  return Math.min(255, Math.max(0, value));
}

export function validateRGB(color) {
  if (!Array.isArray(color) && !(color instanceof Uint8Array) && !(color instanceof Uint8ClampedArray)) {
    throw new TypeError('A color must be an RGB or RGBA array.');
  }
  if (color.length !== 3 && color.length !== 4) throw new RangeError('A color must contain three or four channels.');
  if (Array.from(color).some(channel => !Number.isFinite(channel) || channel < 0 || channel > 255)) {
    throw new RangeError('Color channels must be finite values between 0 and 255.');
  }
  return color;
}

export function hexToRGB(hex) {
  if (typeof hex !== 'string' || !/^#?(?:[\da-f]{3}|[\da-f]{6})$/i.test(hex)) {
    throw new TypeError('Color must be a 3- or 6-digit hexadecimal value.');
  }
  const value = hex.replace(/^#/, '');
  const full = value.length === 3 ? [...value].map(channel => channel + channel).join('') : value;
  return [0, 2, 4].map(index => Number.parseInt(full.slice(index, index + 2), 16));
}

export function rgbToHex(color) {
  validateRGB(color);
  return `#${color.slice(0, 3).map(channel => clampByte(channel).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

export function srgbToLinear(channel) {
  const value = clampChannel(channel) / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function linearToSrgb(channel) {
  if (!Number.isFinite(channel)) throw new TypeError('Linear RGB channels must be finite numbers.');
  const value = Math.min(1, Math.max(0, channel));
  return clampByte(255 * (value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055));
}

export function rgbToLinearRGB(color) {
  validateRGB(color);
  return Array.from(color).slice(0, 3).map(srgbToLinear);
}

export function linearRGBToRGB(color) {
  if (!Array.isArray(color) || color.length !== 3) throw new TypeError('Linear RGB must contain three channels.');
  return color.map(linearToSrgb);
}

export function rgbToLab(color) {
  const [r, g, b] = rgbToLinearRGB(color);
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = value => value > 216 / 24389 ? Math.cbrt(value) : (24389 / 27 * value + 16) / 116;
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function labToRGB([l, a, b]) {
  if (![l, a, b].every(Number.isFinite)) throw new TypeError('Lab components must be finite numbers.');
  const fy = (l + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const inverse = value => value ** 3 > 216 / 24389 ? value ** 3 : (116 * value - 16) / (24389 / 27);
  const x = 0.95047 * inverse(fx);
  const y = inverse(fy);
  const z = 1.08883 * inverse(fz);
  return linearRGBToRGB([
    3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
    -0.969266 * x + 1.8760108 * y + 0.041556 * z,
    0.0556434 * x - 0.2040259 * y + 1.0572252 * z
  ]);
}

export function relativeLuminance(color) {
  const [r, g, b] = rgbToLinearRGB(color);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

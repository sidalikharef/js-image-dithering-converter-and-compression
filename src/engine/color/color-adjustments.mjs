import {rgbToLinearRGB, linearRGBToRGB, clampChannel} from './color-space.mjs';

export const DEFAULT_ADJUSTMENTS = Object.freeze({
  brightness:0, contrast:1, saturation:1, gamma:1, exposure:0,
  hue:0, temperature:0, tint:0, grayscale:false, invert:false
});

const clamp01 = value => Math.min(1, Math.max(0, value));

export function validateAdjustments(adjustments = {}) {
  const values = {...DEFAULT_ADJUSTMENTS, ...adjustments};
  const ranges = {
    brightness:[-1,1], contrast:[0,3], saturation:[0,3], gamma:[0.1,3],
    exposure:[-4,4], hue:[-180,180], temperature:[-1,1], tint:[-1,1]
  };
  for (const [name, [min, max]] of Object.entries(ranges)) {
    if (!Number.isFinite(values[name]) || values[name] < min || values[name] > max) {
      throw new RangeError(`${name} must be between ${min} and ${max}.`);
    }
  }
  if (typeof values.grayscale !== 'boolean' || typeof values.invert !== 'boolean') {
    throw new TypeError('grayscale and invert must be booleans.');
  }
  return values;
}

export function createColorAdjuster(adjustments = {}) {
  const settings = validateAdjustments(adjustments);
  return rgb => {
    if (!Array.isArray(rgb) && !(rgb instanceof Uint8Array) && !(rgb instanceof Uint8ClampedArray)) {
      throw new TypeError('Color must be an RGB array.');
    }
  let [r,g,b] = rgbToLinearRGB(rgb);
  const exposure = 2 ** settings.exposure;
  r *= exposure; g *= exposure; b *= exposure;
  r = (r - 0.5) * settings.contrast + 0.5 + settings.brightness;
  g = (g - 0.5) * settings.contrast + 0.5 + settings.brightness;
  b = (b - 0.5) * settings.contrast + 0.5 + settings.brightness;

  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  r = luminance + (r - luminance) * settings.saturation;
  g = luminance + (g - luminance) * settings.saturation;
  b = luminance + (b - luminance) * settings.saturation;

  const angle = settings.hue * Math.PI / 180;
  if (angle !== 0) {
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const nr = (0.213 + cos * 0.787 - sin * 0.213) * r + (0.715 - cos * 0.715 - sin * 0.715) * g + (0.072 - cos * 0.072 + sin * 0.928) * b;
    const ng = (0.213 - cos * 0.213 + sin * 0.143) * r + (0.715 + cos * 0.285 + sin * 0.140) * g + (0.072 - cos * 0.072 - sin * 0.283) * b;
    const nb = (0.213 - cos * 0.213 - sin * 0.787) * r + (0.715 - cos * 0.715 + sin * 0.715) * g + (0.072 + cos * 0.928 + sin * 0.072) * b;
    r = nr; g = ng; b = nb;
  }
  r += settings.temperature * 0.12 + settings.tint * 0.025;
  g += settings.tint * 0.025;
  b -= settings.temperature * 0.12 - settings.tint * 0.025;
  if (settings.grayscale) {
    const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = g = b = gray;
  }
  const gamma = 1 / settings.gamma;
  const encoded = linearRGBToRGB([r,g,b].map(channel => clampChannel(clamp01(channel) ** gamma)));
  return settings.invert ? encoded.map(channel => 255 - channel) : encoded;
  };
}

export function adjustColor(rgb, adjustments = {}) {
  return createColorAdjuster(adjustments)(rgb);
}

export function adjustImage(image, adjustments = {}, {alphaMode = 'preserve', background = [255,255,255]} = {}) {
  const {data,width,height} = image ?? {};
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || data?.length !== width * height * 4) {
    throw new RangeError('Invalid RGBA image buffer.');
  }
  if (!['preserve','composite','opaque'].includes(alphaMode)) throw new RangeError('Unknown alpha mode.');
  const output = new Uint8ClampedArray(data.length);
  const adjust = createColorAdjuster(adjustments);
  for (let i=0;i<data.length;i+=4) {
    const alpha = data[i+3] / 255;
    if (alphaMode === 'preserve' && alpha === 0) continue;
    const rgb = alphaMode !== 'preserve'
      ? [0,1,2].map(channel => data[i+channel] * alpha + background[channel] * (1-alpha))
      : data.subarray(i,i+3);
    output.set(adjust(rgb),i);
    output[i+3] = alphaMode === 'preserve' ? data[i+3] : 255;
  }
  return {data:output,width,height};
}

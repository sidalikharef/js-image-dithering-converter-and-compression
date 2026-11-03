export const DEFAULT_OPTIONS = Object.freeze({
  threshold: 128,
  contrast: 1,
  strength: 1,
  serpentine: false,
  matrixSize: 4,
  orderedStrength: 1,
  seed: 1,
  randomness: 1
});

export function validateImageData(image) {
  const {data, width, height} = image ?? {};
  const pixelCount = width * height;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)
    || width < 1 || height < 1 || !Number.isSafeInteger(pixelCount)
    || !data || data.length !== pixelCount * 4) {
    throw new RangeError('Invalid RGBA image buffer.');
  }
}

export function validateOptions(options) {
  const settings = {...DEFAULT_OPTIONS, ...options};
  if (!Number.isFinite(settings.threshold) || settings.threshold < 0 || settings.threshold > 255) {
    throw new RangeError('Threshold must be between 0 and 255.');
  }
  if (!Number.isFinite(settings.contrast) || settings.contrast < 0 || settings.contrast > 4) {
    throw new RangeError('Contrast must be between 0 and 4.');
  }
  for (const [name, value] of [['strength', settings.strength], ['orderedStrength', settings.orderedStrength], ['randomness', settings.randomness]]) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new RangeError(`${name} must be between 0 and 1.`);
    }
  }
  if (typeof settings.serpentine !== 'boolean') {
    throw new TypeError('Serpentine scanning must be a boolean.');
  }
  if (![2, 4, 8].includes(settings.matrixSize)) {
    throw new RangeError('Bayer matrix size must be 2, 4, or 8.');
  }
  if (!Number.isSafeInteger(settings.seed) || settings.seed < 0 || settings.seed > 0xFFFFFFFF) {
    throw new RangeError('Random seed must be an integer between 0 and 4294967295.');
  }
  return settings;
}

export function validateAlgorithm(algorithm) {
  if (!algorithm) throw new TypeError('An algorithm identifier is required.');
}

import {ALGORITHMS} from '../engine/registry.mjs';
import {validatePaletteColors, validatePaletteName} from '../engine/color/palette-validation.mjs';
import {hexToRGB} from '../engine/color/color-space.mjs';
import {DEFAULT_GEOMETRY, validateGeometry} from './transforms.mjs';

export const EDITOR_STATE_VERSION = 1;

export const DEFAULT_SETTINGS = Object.freeze({
  width: 1200,
  grain: 4,
  threshold: 128,
  contrast: 1,
  strength: 1,
  quality: 0.75,
  algorithm: 'floyd-steinberg',
  matrixSize: 4,
  orderedStrength: 1,
  seed: 1,
  randomness: 1,
  serpentine: false,
  preset: '',
  mode: 'monochrome',
  paletteId: 'black-white',
  paletteName: 'Black and White',
  distanceMethod: 'rgb',
  alphaMode: 'preserve',
  background: '#FFFFFF',
  brightness: 0,
  adjustContrast: 0,
  saturation: 0,
  gamma: 1,
  exposure: 0,
  hue: 0,
  temperature: 0,
  tint: 0,
  grayscale: false,
  invert: false
});

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const ALGORITHM_IDS = Object.freeze(ALGORITHMS.map(algorithm => algorithm.id));

const NUMERIC_FIELDS = Object.freeze({
  width: {min: 1, max: 20000, default: 1200, integer: true},
  grain: {min: 1, max: 16, default: 4, integer: true},
  threshold: {min: 0, max: 255, default: 128},
  contrast: {min: 0, max: 4, default: 1},
  strength: {min: 0, max: 1, default: 1},
  quality: {min: 0.1, max: 1, default: 0.75},
  matrixSize: {values: [2, 4, 8], default: 4},
  orderedStrength: {min: 0, max: 1, default: 1},
  seed: {min: 0, max: 0xFFFFFFFF, default: 1, integer: true},
  randomness: {min: 0, max: 1, default: 1},
  brightness: {min: -100, max: 100, default: 0},
  adjustContrast: {min: -100, max: 100, default: 0},
  saturation: {min: -100, max: 100, default: 0},
  gamma: {min: 0.1, max: 3, default: 1},
  exposure: {min: -3, max: 3, default: 0},
  hue: {min: -180, max: 180, default: 0},
  temperature: {min: -1, max: 1, default: 0},
  tint: {min: -1, max: 1, default: 0}
});

const ENUM_FIELDS = Object.freeze({
  algorithm: {values: ALGORITHM_IDS, default: 'floyd-steinberg'},
  mode: {values: ['monochrome', 'color'], default: 'monochrome'},
  distanceMethod: {values: ['rgb', 'linear-rgb', 'lab76'], default: 'rgb'},
  alphaMode: {values: ['preserve', 'composite', 'opaque'], default: 'preserve'}
});

const BOOLEAN_FIELDS = Object.freeze(['serpentine', 'grayscale', 'invert']);
const STRING_FIELDS = Object.freeze({
  preset: {max: 128, default: ''},
  paletteId: {max: 128, default: 'black-white'},
  paletteName: {max: 64, default: 'Black and White'}
});
const VIEWS = new Set(['processed', 'side-by-side', 'compare', 'original']);

function rejectDangerousKeys(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  for (const key of Object.keys(value)) {
    if (DANGEROUS_KEYS.has(key)) throw new TypeError('Settings contain a forbidden property name.');
  }
}

function readNumber(input, name, spec, strict) {
  const raw = input[name];
  if (raw === undefined) return spec.default;
  const value = Number(raw);
  if (!Number.isFinite(value) || (spec.integer && !Number.isSafeInteger(value))
    || (spec.values && !spec.values.includes(value))
    || (spec.min !== undefined && value < spec.min)
    || (spec.max !== undefined && value > spec.max)) {
    if (strict) throw new RangeError(`${name} is outside its supported range.`);
    return spec.default;
  }
  return value;
}

function readString(input, name, spec, strict) {
  const raw = input[name];
  if (raw === undefined) return spec.default;
  if (typeof raw !== 'string' || raw.length > spec.max || raw.includes('\u0000')) {
    if (strict) throw new TypeError(`${name} must be a string of at most ${spec.max} characters.`);
    return spec.default;
  }
  return raw;
}

/**
 * Normalise untrusted settings into the canonical editing configuration.
 * In strict mode invalid values throw; otherwise each invalid field falls back
 * to its default so corrupted session data cannot break the editor.
 */
export function normalizeSettings(input = {}, {strict = false} = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    if (strict) throw new TypeError('Settings must be an object.');
    input = {};
  }
  rejectDangerousKeys(input);

  const settings = {};
  for (const [name, spec] of Object.entries(NUMERIC_FIELDS)) {
    settings[name] = readNumber(input, name, spec, strict);
  }
  for (const [name, spec] of Object.entries(ENUM_FIELDS)) {
    settings[name] = readString(input, name, {max: 128, default: spec.default}, strict);
    if (!spec.values.includes(settings[name])) {
      if (strict) throw new RangeError(`${name} is not supported.`);
      settings[name] = spec.default;
    }
  }
  for (const name of BOOLEAN_FIELDS) {
    if (typeof input[name] === 'boolean') settings[name] = input[name];
    else if (input[name] === undefined) settings[name] = DEFAULT_SETTINGS[name];
    else if (strict) throw new TypeError(`${name} must be a boolean.`);
    else settings[name] = DEFAULT_SETTINGS[name];
  }
  for (const [name, spec] of Object.entries(STRING_FIELDS)) {
    settings[name] = readString(input, name, {max: spec.max, default: spec.default}, strict).trim();
  }
  if (settings.paletteName.length === 0) {
    if (strict) throw new TypeError('paletteName must not be empty.');
    settings.paletteName = STRING_FIELDS.paletteName.default;
  }

  const background = typeof input.background === 'string' ? input.background : DEFAULT_SETTINGS.background;
  try {
    hexToRGB(background);
    settings.background = background;
  } catch {
    if (strict) throw new TypeError('background must be a hexadecimal color.');
    settings.background = DEFAULT_SETTINGS.background;
  }

  if (input.paletteColors !== undefined) {
    try {
      settings.paletteColors = validatePaletteColors(input.paletteColors);
      if (input.paletteName !== undefined) {
        settings.paletteName = validatePaletteName(input.paletteName);
      }
    } catch (error) {
      if (strict) throw error;
    }
  }
  return settings;
}

export function normalizeView(view) {
  return VIEWS.has(view) ? view : 'processed';
}

export function normalizeTheme(theme) {
  return theme === 'light' ? 'light' : 'dark';
}

export function createEditorState({settings = {}, geometry = DEFAULT_GEOMETRY, view = 'processed', theme = 'dark'} = {}) {
  return {
    schemaVersion: EDITOR_STATE_VERSION,
    settings: normalizeSettings(settings),
    geometry: validateGeometry(geometry),
    view: normalizeView(view),
    theme: normalizeTheme(theme)
  };
}

export {VIEWS};

import {
  DEFAULT_ADJUSTMENTS,
  validateAdjustments
} from '../engine/color/color-adjustments.mjs';

/**
 * UI-facing adjustment values. These are mapped to the engine's normalised
 * linear-light model by `adjustmentsFromSettings`.
 */
export const UI_ADJUSTMENT_DEFAULTS = Object.freeze({
  brightness: 0,
  contrast: 0,
  saturation: 0,
  exposure: 0,
  gamma: 1,
  hue: 0,
  grayscale: false,
  invert: false,
  temperature: 0,
  tint: 0
});

export const UI_ADJUSTMENT_RANGES = Object.freeze({
  brightness: {min: -100, max: 100, step: 1},
  contrast: {min: -100, max: 100, step: 1},
  saturation: {min: -100, max: 100, step: 1},
  exposure: {min: -3, max: 3, step: 0.1},
  gamma: {min: 0.1, max: 3, step: 0.05},
  hue: {min: -180, max: 180, step: 1},
  temperature: {min: -1, max: 1, step: 0.05},
  tint: {min: -1, max: 1, step: 0.05}
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function normalizeUiAdjustments(values = {}) {
  const input = values && typeof values === 'object' ? values : {};
  const output = {...UI_ADJUSTMENT_DEFAULTS};
  for (const [name, range] of Object.entries(UI_ADJUSTMENT_RANGES)) {
    const value = Number(input[name]);
    output[name] = Number.isFinite(value) ? clamp(value, range.min, range.max) : range.default ?? UI_ADJUSTMENT_DEFAULTS[name];
  }
  output.grayscale = input.grayscale === true;
  output.invert = input.invert === true;
  return output;
}

/**
 * Convert UI ranges to the engine's adjustment model.
 *
 * Brightness is an additive offset of ±1.0 in linear light. Contrast and
 * saturation are multipliers from 0 to 2. Exposure is measured in EV stops.
 * Hue is in degrees. Temperature and tint are normalised offsets. Grayscale is
 * applied in linear light; inversion is applied to the final sRGB code values.
 */
export function adjustmentsFromSettings(settings = {}) {
  const ui = normalizeUiAdjustments(settings);
  return validateAdjustments({
    brightness: ui.brightness / 100,
    contrast: clamp(1 + ui.contrast / 100, 0, 3),
    saturation: clamp(1 + ui.saturation / 100, 0, 3),
    gamma: ui.gamma,
    exposure: ui.exposure,
    hue: ui.hue,
    temperature: ui.temperature,
    tint: ui.tint,
    grayscale: ui.grayscale,
    invert: ui.invert
  });
}

export function isNeutralAdjustments(adjustments = DEFAULT_ADJUSTMENTS) {
  const values = validateAdjustments(adjustments);
  return Object.entries(DEFAULT_ADJUSTMENTS)
    .every(([name, value]) => values[name] === value);
}

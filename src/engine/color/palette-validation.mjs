import {hexToRGB, rgbToHex} from './color-space.mjs';

export const MIN_PALETTE_COLORS = 2;
export const MAX_PALETTE_COLORS = 256;
export const MAX_PALETTE_JSON_BYTES = 64 * 1024;

export function validatePaletteColors(colors, {allowSingle = false, rejectDuplicates = true} = {}) {
  if (!Array.isArray(colors)) throw new TypeError('Palette colors must be an array.');
  const minimum = allowSingle ? 1 : MIN_PALETTE_COLORS;
  if (colors.length < minimum || colors.length > MAX_PALETTE_COLORS) {
    throw new RangeError(`A palette must contain ${minimum}–${MAX_PALETTE_COLORS} colors.`);
  }
  const normalized = colors.map(color => rgbToHex(hexToRGB(color)));
  if (rejectDuplicates && new Set(normalized).size !== normalized.length) {
    throw new RangeError('Palette colors must not contain duplicates.');
  }
  return normalized;
}

export function validatePaletteName(name) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 64) {
    throw new TypeError('Palette name must contain 1–64 characters.');
  }
  return name.trim();
}

export function parsePaletteJSON(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_PALETTE_JSON_BYTES) {
    throw new RangeError('Palette JSON must be no larger than 64 KiB.');
  }
  let value;
  try { value = JSON.parse(text); } catch { throw new TypeError('Palette file is not valid JSON.'); }
  if (!value || Array.isArray(value) || typeof value !== 'object' || value.schemaVersion !== 1) {
    throw new TypeError('Unsupported palette JSON schema; expected schemaVersion 1.');
  }
  return {schemaVersion:1, name:validatePaletteName(value.name), colors:validatePaletteColors(value.colors)};
}

export function serializePaletteJSON(palette) {
  return `${JSON.stringify({
    schemaVersion:1,
    name:validatePaletteName(palette.name),
    colors:validatePaletteColors(palette.colors)
  }, null, 2)}\n`;
}

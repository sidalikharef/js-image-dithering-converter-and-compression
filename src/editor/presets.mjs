import {normalizeSettings} from './state.mjs';

export const PRESET_SCHEMA_VERSION = 1;
export const PRESET_STORAGE_KEY = 'sidali-ditherlab:editor-presets:v1';
export const MAX_PRESET_JSON_BYTES = 256 * 1024;

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function assertSafe(value, depth = 0) {
  if (depth > 8) throw new TypeError('Preset nesting is too deep.');
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) assertSafe(item, depth + 1);
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (DANGEROUS_KEYS.has(key)) throw new TypeError('Preset contains a forbidden property name.');
    assertSafe(item, depth + 1);
  }
}

export function validatePresetName(name) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 64) {
    throw new TypeError('Preset name must contain 1–64 characters.');
  }
  return name.trim();
}

function builtInPreset(id, name, description, settings) {
  return Object.freeze({
    schemaVersion: PRESET_SCHEMA_VERSION,
    id,
    name,
    description,
    builtIn: true,
    settings: Object.freeze(normalizeSettings(settings, {strict: true}))
  });
}

export const BUILT_IN_PRESETS = Object.freeze([
  builtInPreset('classic-monochrome', 'Classic Monochrome', 'Balanced Floyd–Steinberg black and white.', {
    mode: 'monochrome', algorithm: 'floyd-steinberg', threshold: 128, contrast: 1,
    strength: 1, serpentine: false, grayscale: true
  }),
  builtInPreset('retro-game-boy', 'Retro Game Boy', 'Four-tone DMG palette with clean error diffusion.', {
    mode: 'color', algorithm: 'floyd-steinberg', paletteId: 'game-boy-classic',
    paletteName: 'Game Boy Classic', distanceMethod: 'rgb', strength: 1,
    saturation: 15, contrast: 0.8
  }),
  builtInPreset('newspaper-halftone', 'Newspaper Halftone', 'Ordered 4×4 pattern with firm ink contrast.', {
    mode: 'monochrome', algorithm: 'bayer', matrixSize: 4, orderedStrength: 1,
    threshold: 132, contrast: 1.2, grayscale: true
  }),
  builtInPreset('vintage-terminal', 'Vintage Terminal', 'Phosphor-green four-tone terminal look.', {
    mode: 'color', algorithm: 'atkinson', paletteId: 'custom', paletteName: 'Terminal Phosphor',
    paletteColors: ['#08140A', '#1F3A1F', '#4E7A4E', '#B7F7B7'],
    distanceMethod: 'rgb', contrast: 2, brightness: 2
  }),
  builtInPreset('high-contrast-pixel-art', 'High Contrast Pixel Art', 'Hard-edged ordered dithering for pixel art.', {
    mode: 'monochrome', algorithm: 'bayer', matrixSize: 2, orderedStrength: 1,
    threshold: 118, contrast: 1.6, grayscale: true
  }),
  builtInPreset('soft-color-dither', 'Soft Color Dither', 'Gentle pastel diffusion with lower strength.', {
    mode: 'color', algorithm: 'stucki', paletteId: 'pastel', paletteName: 'Pastel',
    distanceMethod: 'lab76', strength: 0.75, saturation: 5, contrast: 0
  }),
  builtInPreset('limited-palette-illustration', 'Limited Palette Illustration', 'Graphic five-color ink illustration.', {
    mode: 'color', algorithm: 'atkinson', paletteId: 'high-contrast',
    paletteName: 'High Contrast', distanceMethod: 'lab76', strength: 0.9,
    saturation: 12, contrast: 2
  })
]);

const builtInById = new Map(BUILT_IN_PRESETS.map(preset => [preset.id, preset]));

export function getBuiltInPreset(id) {
  return builtInById.get(id) ?? null;
}

export function normalizePreset(input, {strict = true, builtIn = false} = {}) {
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new TypeError('Preset must be an object.');
    }
    assertSafe(input);
    if (input.schemaVersion !== PRESET_SCHEMA_VERSION) {
      throw new TypeError('Unsupported preset schema; expected schemaVersion 1.');
    }
    const name = validatePresetName(input.name);
    const id = typeof input.id === 'string' && input.id.trim() ? input.id.trim() : null;
    if (id && (id.length > 128 || id.includes('\u0000'))) {
      throw new TypeError('Preset identifier is invalid.');
    }
    const description = typeof input.description === 'string' ? input.description.slice(0, 240) : '';
    const settings = normalizeSettings(input.settings, {strict});
    return {
      schemaVersion: PRESET_SCHEMA_VERSION,
      id,
      name,
      description,
      builtIn: builtIn || input.builtIn === true,
      settings
    };
  } catch (error) {
    if (strict) throw error;
    return null;
  }
}

export function serializePreset(preset) {
  const value = normalizePreset(preset, {strict: true});
  return `${JSON.stringify({
    schemaVersion: PRESET_SCHEMA_VERSION,
    id: value.id,
    name: value.name,
    description: value.description,
    settings: value.settings
  }, null, 2)}\n`;
}

function resolveStorage(storage) {
  if (storage !== undefined) return storage;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function makeId(now) {
  const random = Math.floor(Math.random() * 0xFFFFFF).toString(36);
  return `custom-${now.toString(36)}-${random}`;
}

export function createPresetStore({storage, now = () => Date.now()} = {}) {
  const target = resolveStorage(storage);
  let custom = [];

  function read() {
    if (!target) return [];
    let text;
    try { text = target.getItem(PRESET_STORAGE_KEY); } catch { return []; }
    if (!text) return [];
    let document;
    try { document = JSON.parse(text); } catch { return []; }
    if (!document || typeof document !== 'object' || document.schemaVersion !== PRESET_SCHEMA_VERSION
      || !Array.isArray(document.presets)) return [];
    const seen = new Set();
    const valid = [];
    for (const item of document.presets) {
      const preset = normalizePreset(item, {strict: false});
      if (!preset || preset.builtIn) continue;
      if (!preset.id) preset.id = makeId(now());
      if (seen.has(preset.id) || builtInById.has(preset.id)) continue;
      seen.add(preset.id);
      valid.push(preset);
    }
    return valid;
  }

  custom = read();

  function persist() {
    if (!target) return false;
    try {
      target.setItem(PRESET_STORAGE_KEY, JSON.stringify({
        schemaVersion: PRESET_SCHEMA_VERSION,
        presets: custom
      }));
      return true;
    } catch {
      return false;
    }
  }

  function add(name, settings, description = '') {
    const preset = normalizePreset({
      schemaVersion: PRESET_SCHEMA_VERSION,
      id: makeId(now()),
      name,
      description,
      settings
    }, {strict: true});
    custom.push(preset);
    const saved = persist();
    return {preset, saved};
  }

  function rename(id, name) {
    const preset = custom.find(item => item.id === id);
    if (!preset) return false;
    preset.name = validatePresetName(name);
    persist();
    return true;
  }

  function remove(id) {
    const index = custom.findIndex(item => item.id === id);
    if (index < 0) return false;
    custom.splice(index, 1);
    persist();
    return true;
  }

  function clear() {
    custom = [];
    persist();
  }

  function importJSON(text) {
    if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_PRESET_JSON_BYTES) {
      throw new RangeError('Preset JSON must be no larger than 256 KiB.');
    }
    let parsed;
    try { parsed = JSON.parse(text); } catch { throw new TypeError('Preset file is not valid JSON.'); }
    const items = Array.isArray(parsed?.presets) ? parsed.presets : [parsed];
    const added = [];
    for (const item of items) {
      const preset = normalizePreset(item, {strict: true});
      if (!preset.id || builtInById.has(preset.id) || custom.some(existing => existing.id === preset.id)) {
        preset.id = makeId(now());
      }
      preset.builtIn = false;
      custom.push(preset);
      added.push(preset);
    }
    persist();
    return added;
  }

  return {
    list() { return [...BUILT_IN_PRESETS, ...custom.map(preset => ({...preset}))]; },
    custom() { return custom.map(preset => ({...preset})); },
    get(id) {
      return builtInById.get(id) ?? custom.find(preset => preset.id === id) ?? null;
    },
    add,
    rename,
    remove,
    clear,
    importJSON,
    exportJSON() {
      return `${JSON.stringify({
        schemaVersion: PRESET_SCHEMA_VERSION,
        presets: custom
      }, null, 2)}\n`;
    },
    refresh() { custom = read(); return this.list(); }
  };
}

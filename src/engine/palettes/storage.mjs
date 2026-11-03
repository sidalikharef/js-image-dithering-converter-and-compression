import {validatePaletteColors, validatePaletteName} from '../color/palette-validation.mjs';

export const CUSTOM_PALETTE_STORAGE_KEY = 'sidali-ditherlab:custom-palettes:v1';

export function parseStoredPalettes(value) {
  if (value == null || value === '') return [];
  let parsed;
  try { parsed = JSON.parse(value); } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  const palettes = [];
  for (const item of parsed) {
    try {
      if (!item || typeof item.id !== 'string') continue;
      palettes.push({
        id:item.id,
        name:validatePaletteName(item.name),
        category:'Custom',
        description:'Locally saved custom palette.',
        colors:validatePaletteColors(item.colors),
        colorCount:item.colors.length,
        source:'user',
        editable:true,
        builtIn:false
      });
    } catch { /* Ignore malformed entries while keeping other saved palettes available. */ }
  }
  return palettes;
}

export function savePalettes(palettes, storage) {
  const clean = palettes.map(item => ({
    id:String(item.id),
    name:validatePaletteName(item.name),
    colors:validatePaletteColors(item.colors)
  }));
  try {
    (storage ?? globalThis.localStorage).setItem(CUSTOM_PALETTE_STORAGE_KEY, JSON.stringify(clean));
    return true;
  } catch (error) {
    if (error?.name === 'QuotaExceededError' || error?.name === 'SecurityError') return false;
    throw error;
  }
}

export function loadPalettes(storage) {
  try { return parseStoredPalettes((storage ?? globalThis.localStorage).getItem(CUSTOM_PALETTE_STORAGE_KEY)); }
  catch { return []; }
}

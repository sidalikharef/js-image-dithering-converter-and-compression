import {BUILT_IN_PALETTES} from './built-in.mjs';
import {validatePaletteColors} from '../color/palette-validation.mjs';

const registry = new Map(BUILT_IN_PALETTES.map(item => [item.id, item]));

for (const item of BUILT_IN_PALETTES) validatePaletteColors(item.colors);

export function listPalettes(category = '') {
  return BUILT_IN_PALETTES.filter(item => !category || item.category === category);
}

export function getPalette(id) {
  const item = registry.get(id);
  if (!item) throw new RangeError(`Unknown built-in palette: ${id}`);
  return item;
}

export function isBuiltInPalette(id) {
  return registry.has(id);
}

import {validatePaletteColors, validatePaletteName} from '../color/palette-validation.mjs';

export function createCustomPalette(name, colors) {
  return {id:`custom-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`,
    name:validatePaletteName(name), colors:validatePaletteColors(colors), category:'Custom',
    description:'User-created palette.', colorCount:colors.length, source:'user', editable:true, builtIn:false};
}

export function updateCustomPalette(palette, changes) {
  if (!palette || palette.builtIn) throw new TypeError('Built-in palettes cannot be edited.');
  const name = changes.name === undefined ? palette.name : validatePaletteName(changes.name);
  const colors = changes.colors === undefined ? palette.colors.slice() : validatePaletteColors(changes.colors);
  return {...palette, name, colors, colorCount:colors.length};
}

export const PRESETS = Object.freeze([
  {id:'classic-mono', name:'Classic Mono', settings:{algorithm:'floyd-steinberg', threshold:128, contrast:1, strength:1, serpentine:false}},
  {id:'retro-macintosh', name:'Retro Macintosh', settings:{algorithm:'atkinson', threshold:128, contrast:1.15, strength:1, serpentine:false}},
  {id:'newspaper-texture', name:'Newspaper Texture', settings:{algorithm:'bayer', threshold:128, contrast:1, matrixSize:4, orderedStrength:1}},
  {id:'soft-diffusion', name:'Soft Diffusion', settings:{algorithm:'jarvis-judice-ninke', threshold:128, contrast:1, strength:.85, serpentine:true}},
  {id:'sharp-pixel-mono', name:'Sharp Pixel Mono', settings:{algorithm:'sierra-lite', threshold:128, contrast:1.1, strength:1, serpentine:true}},
  {id:'experimental-noise', name:'Experimental Noise', settings:{algorithm:'random', threshold:128, contrast:1, seed:42, randomness:.75}}
]);

export function getPreset(id) {
  const preset = PRESETS.find(item => item.id === id);
  if (!preset) throw new RangeError(`Unknown preset: ${id}`);
  return preset;
}

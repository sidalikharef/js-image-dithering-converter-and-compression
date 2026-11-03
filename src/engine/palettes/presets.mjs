export const COLOR_PRESETS = Object.freeze([
  {id:'game-boy-color', name:'Game Boy Classic', settings:{mode:'color',paletteId:'game-boy-classic',algorithm:'atkinson',method:'rgb',strength:1,alphaMode:'preserve'}},
  {id:'retro-cga', name:'Retro CGA', settings:{mode:'color',paletteId:'cga',algorithm:'bayer',method:'rgb',matrixSize:4,orderedStrength:.8,alphaMode:'preserve'}},
  {id:'newspaper-1bit', name:'1-Bit Newspaper', settings:{mode:'color',paletteId:'black-white',algorithm:'floyd-steinberg',method:'lab76',strength:1,alphaMode:'preserve'}},
  {id:'pico-8-pixel-art', name:'PICO-8 Pixel Art', settings:{mode:'color',paletteId:'pico-8',algorithm:'sierra-lite',method:'lab76',strength:.8,serpentine:true,alphaMode:'preserve'}},
  {id:'warm-duotone', name:'Warm Duotone', settings:{mode:'color',paletteId:'warm-sepia',algorithm:'atkinson',method:'linear-rgb',alphaMode:'preserve'}},
  {id:'sunset-dither', name:'Sunset Dither', settings:{mode:'color',paletteId:'sunset',algorithm:'floyd-steinberg',method:'lab76',serpentine:true,alphaMode:'preserve'}},
  {id:'adaptive-8-color', name:'Adaptive 8-Color', settings:{mode:'color',paletteId:'adaptive',algorithm:'sierra-lite',method:'lab76',extractionMethod:'median-cut',colorCount:8,alphaMode:'preserve'}},
  {id:'high-contrast-poster', name:'High-Contrast Poster', settings:{mode:'color',paletteId:'high-contrast',algorithm:'bayer',method:'rgb',matrixSize:4,orderedStrength:.7,contrast:1.2,alphaMode:'preserve'}}
]);

export function getColorPreset(id) {
  const preset=COLOR_PRESETS.find(item=>item.id===id);
  if(!preset) throw new RangeError(`Unknown color preset: ${id}`);
  return preset;
}

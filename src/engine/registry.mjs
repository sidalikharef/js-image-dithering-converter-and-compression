import {floydSteinberg} from './algorithms/floyd-steinberg.mjs';
import {atkinson} from './algorithms/atkinson.mjs';
import {jarvisJudiceNinke} from './algorithms/jarvis-judice-ninke.mjs';
import {stucki} from './algorithms/stucki.mjs';
import {burkes} from './algorithms/burkes.mjs';
import {sierra} from './algorithms/sierra.mjs';
import {sierraLite} from './algorithms/sierra-lite.mjs';
import {bayer} from './algorithms/bayer.mjs';
import {randomDither} from './algorithms/random.mjs';
import {validateImageData, validateOptions} from './validation.mjs';

export const ALGORITHMS = Object.freeze([
  {id:'floyd-steinberg', name:'Floyd–Steinberg', category:'Error diffusion', description:'Classic balanced error diffusion.', process:floydSteinberg, parameters:['threshold','contrast','strength','serpentine']},
  {id:'atkinson', name:'Atkinson', category:'Error diffusion', description:'Crisp classic diffusion with six eighths of the error propagated.', process:atkinson, parameters:['threshold','contrast','strength','serpentine']},
  {id:'jarvis-judice-ninke', name:'Jarvis–Judice–Ninke', category:'Error diffusion', description:'Broad, smooth error diffusion.', process:jarvisJudiceNinke, parameters:['threshold','contrast','strength','serpentine']},
  {id:'stucki', name:'Stucki', category:'Error diffusion', description:'Balanced detail with a broad kernel.', process:stucki, parameters:['threshold','contrast','strength','serpentine']},
  {id:'burkes', name:'Burkes', category:'Error diffusion', description:'A compact, fast two-row diffusion kernel.', process:burkes, parameters:['threshold','contrast','strength','serpentine']},
  {id:'sierra', name:'Sierra', category:'Error diffusion', description:'Detailed diffusion with a three-row kernel.', process:sierra, parameters:['threshold','contrast','strength','serpentine']},
  {id:'sierra-lite', name:'Sierra Lite', category:'Error diffusion', description:'Sharp, compact diffusion for strong pixel detail.', process:sierraLite, parameters:['threshold','contrast','strength','serpentine']},
  {id:'bayer', name:'Bayer Ordered', category:'Ordered dithering', description:'Repeating ordered threshold pattern.', process:bayer, parameters:['threshold','contrast','matrixSize','orderedStrength']},
  {id:'random', name:'Seeded Random', category:'Stochastic dithering', description:'Reproducible stochastic threshold dithering.', process:randomDither, parameters:['threshold','contrast','seed','randomness']}
]);

const byId = new Map(ALGORITHMS.map(algorithm => [algorithm.id, algorithm]));

export function getAlgorithm(id) {
  const algorithm = byId.get(id);
  if (!algorithm) throw new RangeError(`Unknown dithering algorithm: ${id}`);
  return algorithm;
}

export function processImage(image, id, settings = {}) {
  validateImageData(image);
  const algorithm = getAlgorithm(id);
  const options = validateOptions(settings);
  return algorithm.process(image, options);
}

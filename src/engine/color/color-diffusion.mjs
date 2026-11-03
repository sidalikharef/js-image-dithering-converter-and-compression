import {ERROR_DIFFUSION_KERNELS} from '../utilities/kernels.mjs';
import {createSeededRandom} from '../utilities/seeded-random.mjs';
import {getBayerMatrix} from '../algorithms/bayer.mjs';
import {preparePalette, nearestPaletteIndex} from './color-distance.mjs';
import {hexToRGB, validateRGB} from './color-space.mjs';
import {createColorAdjuster, validateAdjustments} from './color-adjustments.mjs';

const METHODS = new Set(['rgb','linear-rgb','lab76']);

function validateColorImage(image) {
  const {data,width,height} = image ?? {};
  const count = width * height;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
      || !Number.isSafeInteger(count) || count > 50_000_000 || data?.length !== count * 4) {
    throw new RangeError('Invalid RGBA image buffer.');
  }
}

function validateSettings(settings, palette) {
  if (!Array.isArray(palette) || palette.length < 2 || palette.length > 256) throw new RangeError('Color dithering requires a palette of 2–256 colors.');
  const colors = palette.map(color => {
    const rgb = typeof color === 'string' ? hexToRGB(color) : Array.from(color);
    validateRGB(rgb);
    return rgb.slice(0,3);
  });
  const method = settings.method ?? 'rgb';
  if (!METHODS.has(method)) throw new RangeError(`Unknown color-distance method: ${method}`);
  const algorithm = settings.algorithm ?? 'floyd-steinberg';
  if (!['floyd-steinberg','atkinson','jarvis-judice-ninke','stucki','burkes','sierra','sierra-lite','bayer','random'].includes(algorithm)) {
    throw new RangeError(`Unknown color dithering algorithm: ${algorithm}`);
  }
  const alphaMode = settings.alphaMode ?? 'preserve';
  if (!['preserve','composite','opaque'].includes(alphaMode)) throw new RangeError('Alpha mode must be preserve, composite, or opaque.');
  const background = settings.background ?? '#FFFFFF';
  const backgroundRGB = typeof background === 'string' ? hexToRGB(background) : Array.from(background);
  validateRGB(backgroundRGB);
  const strength = settings.strength ?? 1;
  const orderedStrength = settings.orderedStrength ?? 1;
  const randomness = settings.randomness ?? 1;
  if (![strength,orderedStrength,randomness].every(value => Number.isFinite(value) && value >= 0 && value <= 1)) {
    throw new RangeError('Color dithering strengths must be between 0 and 1.');
  }
  const matrixSize = settings.matrixSize ?? 4;
  if (![2,4,8].includes(matrixSize)) throw new RangeError('Bayer matrix size must be 2, 4, or 8.');
  const seed = settings.seed ?? 1;
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xFFFFFFFF) throw new RangeError('Seed must be an unsigned 32-bit integer.');
  const serpentine=settings.serpentine ?? false;
  if(typeof serpentine!=='boolean')throw new TypeError('Serpentine scanning must be a boolean.');
  return {
    colors, method, algorithm, alphaMode, background:backgroundRGB, strength, orderedStrength,
    randomness, matrixSize, seed, serpentine,
    adjustments:validateAdjustments(settings.adjustments)
  };
}

function readPixel(image, offset, options, adjust) {
  const alpha = image.data[offset + 3] / 255;
  if (options.alphaMode === 'preserve' && alpha === 0) return null;
  const rgb = options.alphaMode !== 'preserve'
    ? [0,1,2].map(channel => image.data[offset + channel] * alpha + options.background[channel] * (1 - alpha))
    : [image.data[offset],image.data[offset+1],image.data[offset+2]];
  const adjusted = adjust(rgb);
  return adjusted;
}

function writeColor(output, offset, paletteColor, inputAlpha, alphaMode) {
  output[offset] = paletteColor[0];
  output[offset + 1] = paletteColor[1];
  output[offset + 2] = paletteColor[2];
  output[offset + 3] = alphaMode === 'preserve' ? inputAlpha : 255;
}

export function processColorImage(image, settings = {}) {
  validateColorImage(image);
  const palette = settings.palette;
  const options = validateSettings(settings,palette);
  const prepared = preparePalette(options.colors,options.method);
  const adjust = createColorAdjuster(options.adjustments);
  const {width,height,data} = image;
  const output = new Uint8ClampedArray(data.length);

  if (options.algorithm === 'bayer') {
    const matrix = getBayerMatrix(options.matrixSize);
    const scale = 255 * options.orderedStrength;
    for (let y=0;y<height;y++) for (let x=0;x<width;x++) {
      const offset=(y*width+x)*4;
      const value=readPixel(image,offset,options,adjust);
      if(!value)continue;
      const rank = (matrix[y % options.matrixSize][x % options.matrixSize] + .5) / (options.matrixSize ** 2) - .5;
      const rgb = value.map(channel => Math.min(255,Math.max(0,channel + rank * scale)));
      const color = prepared.colors[nearestPaletteIndex(rgb,prepared)];
      writeColor(output,offset,color,data[offset+3],options.alphaMode);
    }
    return {data:output,width,height};
  }

  if (options.algorithm === 'random') {
    const random = createSeededRandom(options.seed);
    const amplitude = 255 * options.randomness;
    for (let pixel=0;pixel<width*height;pixel++) {
      const offset=pixel*4;
      const value=readPixel(image,offset,options,adjust);
      if(!value)continue;
      const noise=(random()-.5)*amplitude;
      const rgb=value.map(channel=>Math.min(255,Math.max(0,channel+noise)));
      const color=prepared.colors[nearestPaletteIndex(rgb,prepared)];
      writeColor(output,offset,color,data[offset+3],options.alphaMode);
    }
    return {data:output,width,height};
  }

  const kernel = ERROR_DIFFUSION_KERNELS[options.algorithm];
  const rowCount=Math.max(...kernel.offsets.map(([,dy])=>dy))+1;
  const work=new Float32Array(width*3*rowCount);
  for (let y=0;y<height;y++) {
    const rowBase=(y%rowCount)*width*3;
    for(let x=0;x<width;x++) {
      const pixelOffset=(y*width+x)*4;
      const value=readPixel(image,pixelOffset,options,adjust);
      if(value)for(let channel=0;channel<3;channel++)work[rowBase+x*3+channel]+=value[channel];
    }
    const reverse = options.serpentine && (y & 1) === 1;
    const start=reverse ? width-1 : 0, end=reverse ? -1 : width, step=reverse ? -1 : 1;
    for (let x=start;x!==end;x+=step) {
      const offset=(y*width+x)*4;
      if (options.alphaMode==='preserve' && data[offset+3]===0) continue;
      const workOffset=rowBase+x*3;
      const value=[work[workOffset],work[workOffset+1],work[workOffset+2]];
      const match=value.map(channel=>Math.min(255,Math.max(0,channel)));
      const selected=prepared.colors[nearestPaletteIndex(match,prepared)];
      writeColor(output,offset,selected,data[offset+3],options.alphaMode);
      for (let channel=0;channel<3;channel++) {
        const error=(value[channel]-selected[channel])*options.strength;
        for (const [dx,dy,weight] of kernel.offsets) {
          const targetX=reverse ? x-dx : x+dx;
          const targetY=y+dy;
          if (targetX<0 || targetX>=width || targetY<0 || targetY>=height) continue;
          const targetOffset=(targetY*width+targetX)*4;
          if (options.alphaMode==='preserve' && data[targetOffset+3]===0) continue;
          const targetWorkOffset=(targetY%rowCount)*width*3+targetX*3+channel;
          work[targetWorkOffset]+=error*weight/kernel.denominator;
        }
      }
    }
    work.fill(0,rowBase,rowBase+width*3);
  }
  return {data:output,width,height};
}

export {validateColorImage};

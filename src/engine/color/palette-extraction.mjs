import {createSeededRandom} from '../utilities/seeded-random.mjs';
import {rgbToHex} from './color-space.mjs';

const MAX_SAMPLES = 50_000;

function samplePixels(image, maxSamples = MAX_SAMPLES) {
  const {data,width,height} = image ?? {};
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || data?.length !== width*height*4) {
    throw new RangeError('Invalid RGBA image buffer.');
  }
  const stride=Math.max(1,Math.ceil(width*height/maxSamples));
  const pixels=[];
  for(let index=0,position=0;index<width*height;index+=stride,position=index*4) {
    if(data[position+3]===0) continue;
    pixels.push([data[position],data[position+1],data[position+2]]);
  }
  return pixels;
}

function representative(pixels) {
  const sum=[0,0,0];
  for(const color of pixels) for(let channel=0;channel<3;channel++) sum[channel]+=color[channel];
  return sum.map(value=>Math.round(value/pixels.length));
}

function stableUnique(colors) {
  const seen=new Set();
  return colors.filter(color=>{const key=rgbToHex(color);if(seen.has(key))return false;seen.add(key);return true;});
}

export function medianCut(image, colorCount=8) {
  if(!Number.isSafeInteger(colorCount)||colorCount<2||colorCount>256) throw new RangeError('Requested color count must be between 2 and 256.');
  const pixels=samplePixels(image);
  if(!pixels.length) throw new RangeError('No non-transparent pixels are available for palette extraction.');
  const boxes=[pixels];
  while(boxes.length<colorCount) {
    let bestIndex=-1,bestRange=-1,bestChannel=0;
    for(let index=0;index<boxes.length;index++) {
      const box=boxes[index];
      if(box.length<2) continue;
      for(let channel=0;channel<3;channel++) {
        let min=255,max=0;
        for(const color of box){min=Math.min(min,color[channel]);max=Math.max(max,color[channel]);}
        const range=max-min;
        if(range>bestRange){bestRange=range;bestIndex=index;bestChannel=channel;}
      }
    }
    if(bestIndex<0) break;
    const sorted=boxes[bestIndex].slice().sort((a,b)=>a[bestChannel]-b[bestChannel]||a[0]-b[0]||a[1]-b[1]||a[2]-b[2]);
    const middle=Math.floor(sorted.length/2);
    if(middle<1||middle>=sorted.length) break;
    boxes.splice(bestIndex,1,sorted.slice(0,middle),sorted.slice(middle));
  }
  return stableUnique(boxes.map(representative)).map(rgbToHex);
}

export function kMeans(image, colorCount=8, {seed=1,maxIterations=30}={}) {
  if(!Number.isSafeInteger(colorCount)||colorCount<2||colorCount>256) throw new RangeError('Requested color count must be between 2 and 256.');
  if(!Number.isSafeInteger(seed)||seed<0||seed>0xFFFFFFFF) throw new RangeError('Seed must be an unsigned 32-bit integer.');
  if(!Number.isSafeInteger(maxIterations)||maxIterations<1||maxIterations>100) throw new RangeError('K-Means iterations must be between 1 and 100.');
  const pixels=samplePixels(image);
  if(!pixels.length) throw new RangeError('No non-transparent pixels are available for palette extraction.');
  const unique=stableUnique(pixels);
  const k=Math.min(colorCount,unique.length);
  const random=createSeededRandom(seed);
  const centers=[];
  const chosen=new Set();
  while(centers.length<k) {
    let index=Math.floor(random()*unique.length);
    while(chosen.has(index)) index=(index+1)%unique.length;
    chosen.add(index);
    centers.push(unique[index].map(Number));
  }
  const assignments=new Uint16Array(pixels.length);
  assignments.fill(0xFFFF);
  for(let iteration=0;iteration<maxIterations;iteration++) {
    let changed=false;
    const sums=Array.from({length:k},()=>[0,0,0,0]);
    for(let index=0;index<pixels.length;index++) {
      const color=pixels[index];
      let nearest=0,best=Infinity;
      for(let center=0;center<k;center++) {
        const distance=(color[0]-centers[center][0])**2+(color[1]-centers[center][1])**2+(color[2]-centers[center][2])**2;
        if(distance<best){best=distance;nearest=center;}
      }
      if(assignments[index]!==nearest) changed=true;
      assignments[index]=nearest;
      sums[nearest][0]+=color[0];sums[nearest][1]+=color[1];sums[nearest][2]+=color[2];sums[nearest][3]++;
    }
    for(let center=0;center<k;center++) {
      if(sums[center][3]) centers[center]=sums[center].slice(0,3).map(value=>value/sums[center][3]);
      else {
        const largest=sums.reduce((best,item,index)=>item[3]>sums[best][3]?index:best,0);
        centers[center]=pixels[Math.floor(random()*pixels.length)].map(Number);
        if(largest===center) centers[center]=unique[(center+iteration)%unique.length].map(Number);
      }
    }
    if(!changed) break;
  }
  return stableUnique(centers.map(color=>color.map(Math.round))).map(rgbToHex);
}

export function extractPalette(image, {method='median-cut',colorCount=8,seed=1,maxIterations=30}={}) {
  const start=globalThis.performance?.now?.() ?? Date.now();
  const colors=method==='median-cut' ? medianCut(image,colorCount)
    : method==='k-means' ? kMeans(image,colorCount,{seed,maxIterations})
      : (()=>{throw new RangeError(`Unknown palette extraction method: ${method}`);})();
  const end=globalThis.performance?.now?.() ?? Date.now();
  return {colors,durationMs:end-start,method,colorCount:colors.length};
}

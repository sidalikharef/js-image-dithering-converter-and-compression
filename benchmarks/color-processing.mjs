import {performance} from 'node:perf_hooks';
import {processColorImage, quantizeImage, medianCut, kMeans, getPalette} from '../src/engine/index.mjs';

const sizes=[256,512,1024];
const palette=getPalette('pico-8').colors;
const rounds=3;

function makeImage(size) {
  const data=new Uint8ClampedArray(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const offset=(y*size+x)*4;
    data[offset]=(x*13+y*3)&255;
    data[offset+1]=(x*5+y*17)&255;
    data[offset+2]=(x*7+y*11)&255;
    data[offset+3]=255;
  }
  return {data,width:size,height:size};
}

function median(values) {
  const sorted=values.slice().sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

function benchmark(label,run) {
  run();
  const durations=[];
  for(let iteration=0;iteration<rounds;iteration++) {
    const start=performance.now();
    run();
    durations.push(performance.now()-start);
  }
  return `${label.padEnd(27)} ${median(durations).toFixed(2)} ms`;
}

console.log(`Median color-processing duration (${rounds} measured runs; warm-up excluded)`);
console.log('Palette quantization and dithering are full-image; extraction uses a maximum 50,000-pixel sample.');
console.log('Case                         256×256      512×512      1024×1024');
for(const size of sizes) {
  const image=makeImage(size);
  const cases=[
    ['Quantize RGB',()=>quantizeImage(image,palette,{method:'rgb'})],
    ['Quantize Linear RGB',()=>quantizeImage(image,palette,{method:'linear-rgb'})],
    ['Quantize Lab ΔE76',()=>quantizeImage(image,palette,{method:'lab76'})],
    ['Color Floyd–Steinberg',()=>processColorImage(image,{palette,algorithm:'floyd-steinberg'})],
    ['Color Atkinson',()=>processColorImage(image,{palette,algorithm:'atkinson'})],
    ['Color Bayer',()=>processColorImage(image,{palette,algorithm:'bayer',matrixSize:4})],
    ['Median Cut extraction',()=>medianCut(image,16)],
    ['K-Means extraction',()=>kMeans(image,16,{seed:42,maxIterations:20})]
  ];
  console.log(`\n${size}×${size}`);
  for(const [label,run] of cases)console.log(benchmark(label,run));
}

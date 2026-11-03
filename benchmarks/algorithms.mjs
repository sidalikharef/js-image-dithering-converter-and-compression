import {ALGORITHMS, processImage} from '../src/engine/registry.mjs';

const SIZES = [256, 512, 1024];
const RUNS = 3;

function makeDeterministicImage(size) {
  const data = new Uint8ClampedArray(size * size * 4);
  let state = 0xD17E12;
  for (let pixel = 0, offset = 0; pixel < size * size; pixel++, offset += 4) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const value = (state >>> 24) & 0xFF;
    data[offset] = value;
    data[offset + 1] = (value * 3) & 0xFF;
    data[offset + 2] = 255 - value;
    data[offset + 3] = 255;
  }
  return {data, width:size, height:size};
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

const options = {threshold:128, contrast:1, strength:1, serpentine:true, matrixSize:4, orderedStrength:1, seed:42, randomness:1};
console.log(`Median processing duration (${RUNS} measured runs; warm-up excluded)`);
console.log('Algorithm                 256×256      512×512      1024×1024');

for (const algorithm of ALGORITHMS) {
  const results = [];
  for (const size of SIZES) {
    const image = makeDeterministicImage(size);
    processImage(image, algorithm.id, options);
    const timings = [];
    for (let run = 0; run < RUNS; run++) {
      const start = performance.now();
      processImage(image, algorithm.id, options);
      timings.push(performance.now() - start);
    }
    results.push(`${median(timings).toFixed(2)} ms`.padStart(10));
  }
  console.log(`${algorithm.name.padEnd(25)} ${results.join('  ')}`);
}

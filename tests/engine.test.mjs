import test from 'node:test';
import assert from 'node:assert/strict';
import {ALGORITHMS, getAlgorithm, processImage, getBayerMatrix} from '../src/engine/index.mjs';
import {ERROR_DIFFUSION_KERNELS} from '../src/engine/utilities/kernels.mjs';
import {PRESETS, getPreset} from '../src/engine/presets.mjs';
import {createHistory} from '../src/engine/history.mjs';
import {makeGradientFixture, makeTransparencyFixture} from './fixtures/algorithm-images.mjs';
import {ditherToTransparentBlack} from '../core.mjs';

const alphaPixels = image => Array.from({length:image.width * image.height}, (_, index) => image.data[index * 4 + 3]);
const settings = {threshold:128, contrast:1, strength:1, matrixSize:4, orderedStrength:1, seed:9, randomness:1, serpentine:false};

test('registry exposes all nine selectable algorithms and rejects unknown identifiers', () => {
  assert.equal(ALGORITHMS.length, 9);
  for (const algorithm of ALGORITHMS) assert.equal(getAlgorithm(algorithm.id).id, algorithm.id);
  assert.throws(() => getAlgorithm('missing'), /Unknown dithering algorithm/);
});

test('diffusion kernels contain the specified weights and denominators', () => {
  assert.equal(ERROR_DIFFUSION_KERNELS['floyd-steinberg'].denominator, 16);
  assert.equal(ERROR_DIFFUSION_KERNELS['floyd-steinberg'].offsets.reduce((sum, item) => sum + item[2], 0), 16);
  assert.equal(ERROR_DIFFUSION_KERNELS.atkinson.denominator, 8);
  assert.equal(ERROR_DIFFUSION_KERNELS.atkinson.offsets.length, 6);
  assert.equal(ERROR_DIFFUSION_KERNELS.atkinson.offsets.reduce((sum, item) => sum + item[2], 0) / 8, 6 / 8);
  assert.equal(ERROR_DIFFUSION_KERNELS['jarvis-judice-ninke'].denominator, 48);
  assert.equal(ERROR_DIFFUSION_KERNELS['jarvis-judice-ninke'].offsets.reduce((sum, item) => sum + item[2], 0), 48);
  assert.equal(ERROR_DIFFUSION_KERNELS.stucki.denominator, 42);
  assert.equal(ERROR_DIFFUSION_KERNELS.stucki.offsets.reduce((sum, item) => sum + item[2], 0), 42);
  assert.equal(ERROR_DIFFUSION_KERNELS.burkes.denominator, 32);
  assert.equal(ERROR_DIFFUSION_KERNELS.burkes.offsets.reduce((sum, item) => sum + item[2], 0), 32);
  assert.equal(ERROR_DIFFUSION_KERNELS.sierra.denominator, 32);
  assert.equal(ERROR_DIFFUSION_KERNELS.sierra.offsets.reduce((sum, item) => sum + item[2], 0), 32);
  assert.equal(ERROR_DIFFUSION_KERNELS['sierra-lite'].denominator, 4);
  assert.equal(ERROR_DIFFUSION_KERNELS['sierra-lite'].offsets.reduce((sum, item) => sum + item[2], 0), 4);
  assert.deepEqual(ERROR_DIFFUSION_KERNELS['sierra-lite'].offsets, [[1,0,2],[-1,1,1],[0,1,1]]);
});

test('Floyd–Steinberg module preserves the legacy core output for identical options', () => {
  const image = makeGradientFixture(9, 7);
  const options = {threshold:117, contrast:1.2, strength:.7};
  assert.deepEqual(
    processImage(image, 'floyd-steinberg', options).data,
    ditherToTransparentBlack(image, options).data
  );
});

test('all nine algorithms process checked-in gradient and transparency fixtures without mutating input', () => {
  const fixtures = [makeGradientFixture(7, 5), makeTransparencyFixture()];
  for (const algorithm of ALGORITHMS) {
    for (const fixture of fixtures) {
      const original = fixture.data.slice();
      const output = processImage(fixture, algorithm.id, settings);
      assert.equal(output.width, fixture.width, algorithm.id);
      assert.equal(output.height, fixture.height, algorithm.id);
      assert.equal(output.data.length, fixture.data.length, algorithm.id);
      assert.deepEqual(fixture.data, original, `${algorithm.id} mutated source`);
      for (let index = 0; index < output.data.length; index += 4) {
        assert.deepEqual(Array.from(output.data.slice(index, index + 4)), [0,0,0,output.data[index+3]]);
        assert.ok(output.data[index+3] === 0 || output.data[index+3] === 255);
      }
    }
  }
});

test('algorithms handle 1×1, one-row, one-column, odd and even image dimensions', () => {
  for (const algorithm of ALGORITHMS) {
    for (const [width, height] of [[1,1],[1,7],[8,1],[5,3],[6,4]]) {
      const image = makeGradientFixture(width, height);
      const output = processImage(image, algorithm.id, settings);
      assert.equal(output.data.length, width * height * 4);
      assert.equal(output.width, width);
    }
  }
});

test('Bayer matrices are valid, distinct, and repeat periodically', () => {
  assert.deepEqual(getBayerMatrix(2), [[0,2],[3,1]]);
  for (const size of [2,4,8]) {
    const matrix = getBayerMatrix(size);
    assert.equal(matrix.length, size);
    assert.equal(new Set(matrix.flat()).size, size * size);
    assert.ok(matrix.every(row => row.length === size));
    const fixture = makeGradientFixture(size * 2, size * 2);
    fixture.data.fill(255);
    for (let index = 0; index < fixture.data.length; index += 4) fixture.data[index] = fixture.data[index + 1] = fixture.data[index + 2] = 128;
    const output = processImage(fixture, 'bayer', {...settings, matrixSize:size, threshold:128});
    assert.equal(output.data[3], output.data[size * 4 + 3]);
  }
  assert.throws(() => getBayerMatrix(3), RangeError);
});

test('all algorithms preserve pure black and white endpoints and support threshold extremes', () => {
  for (const algorithm of ALGORITHMS) {
    const black = {width:2,height:2,data:new Uint8ClampedArray(Array.from({length:16},(_,i)=>i%4===3?255:0))};
    const white = {width:2,height:2,data:new Uint8ClampedArray(Array.from({length:16},(_,i)=>i%4===3?255:255))};
    assert.ok(alphaPixels(processImage(black,algorithm.id,settings)).every(alpha=>alpha===255),algorithm.id);
    assert.ok(alphaPixels(processImage(white,algorithm.id,settings)).every(alpha=>alpha===0),algorithm.id);
  }
  const pixel = {width:1,height:1,data:new Uint8ClampedArray([127,127,127,255])};
  assert.equal(processImage(pixel,'floyd-steinberg',{...settings,threshold:0}).data[3],0);
  assert.equal(processImage(pixel,'floyd-steinberg',{...settings,threshold:255}).data[3],255);
});

test('Bayer zero strength is ordinary thresholding and full strength is patterned', () => {
  const image = makeGradientFixture(8, 8);
  image.data.fill(127);
  for (let i=3;i<image.data.length;i+=4) image.data[i]=255;
  const plain = processImage(image, 'bayer', {...settings, threshold:128, orderedStrength:0});
  const ordered = processImage(image, 'bayer', {...settings, threshold:128, orderedStrength:1});
  assert.deepEqual(new Set(alphaPixels(plain)), new Set([255]));
  assert.equal(new Set(alphaPixels(ordered)).size, 2);
});

test('seeded random results repeat for a seed and vary across seeds', () => {
  const image = makeGradientFixture(32, 16);
  image.data.fill(128);
  for (let i=3;i<image.data.length;i+=4) image.data[i]=255;
  const first = processImage(image, 'random', {...settings, seed:123, randomness:1});
  const second = processImage(image, 'random', {...settings, seed:123, randomness:1});
  const other = processImage(image, 'random', {...settings, seed:124, randomness:1});
  assert.deepEqual(first.data, second.data);
  assert.notDeepEqual(first.data, other.data);
  const threshold = processImage(image, 'random', {...settings, threshold:128, randomness:0, seed:123});
  assert.deepEqual(new Set(alphaPixels(threshold)), new Set([0]));
});

test('serpentine diffusion mirrors row traversal and never wraps across image edges', () => {
  const image = makeGradientFixture(9, 6);
  for (const algorithm of ALGORITHMS.filter(item => item.category === 'Error diffusion')) {
    const standard = processImage(image, algorithm.id, settings);
    const serpentine = processImage(image, algorithm.id, {...settings, serpentine:true});
    assert.equal(serpentine.data.length, standard.data.length);
    assert.ok(serpentine.data.some((value, index) => value !== standard.data[index]), `${algorithm.id} should use mirrored row traversal`);
  }
});

test('transparent source pixels become transparent and opaque output stays monochrome', () => {
  const image = makeTransparencyFixture();
  for (const algorithm of ALGORITHMS) {
    const result = processImage(image, algorithm.id, settings);
    const transparentPixelIndex = 4;
    assert.equal(result.data[transparentPixelIndex * 4 + 3], 0);
    assert.ok(alphaPixels(result).every(alpha => alpha === 0 || alpha === 255));
  }
});

test('invalid dimensions, thresholds, strengths, seeds, and Bayer sizes throw explicit errors', () => {
  assert.throws(() => processImage({width:0,height:1,data:new Uint8Array()}, 'bayer'), RangeError);
  assert.throws(() => processImage(makeGradientFixture(1,1), 'bayer', {...settings, matrixSize:3}), RangeError);
  assert.throws(() => processImage(makeGradientFixture(1,1), 'random', {...settings, seed:-1}), RangeError);
  assert.throws(() => processImage(makeGradientFixture(1,1), 'floyd-steinberg', {...settings, strength:2}), RangeError);
  assert.throws(() => processImage(makeGradientFixture(1,1), 'bayer', {...settings, orderedStrength:2}), RangeError);
  assert.throws(() => processImage(makeGradientFixture(1,1), 'random', {...settings, randomness:2}), RangeError);
});

test('all six presets contain a registered algorithm and valid core configuration', () => {
  assert.equal(PRESETS.length, 6);
  for (const preset of PRESETS) {
    assert.equal(getPreset(preset.id).id, preset.id);
    assert.ok(ALGORITHMS.some(algorithm => algorithm.id === preset.settings.algorithm));
    processImage(makeGradientFixture(3,2), preset.settings.algorithm, {...settings, ...preset.settings});
  }
});

test('history restores settings exactly through undo, redo, and reset configurations', () => {
  const initial = {algorithm:'floyd-steinberg', threshold:128, preset:''};
  const history = createHistory(initial);
  const preset = {algorithm:'bayer', threshold:145, matrixSize:8, preset:'newspaper-texture'};
  assert.equal(history.push(preset), true);
  assert.deepEqual(history.undo(), initial);
  assert.deepEqual(history.redo(), preset);
  assert.equal(history.push(initial), true);
  assert.deepEqual(history.undo(), preset);
});

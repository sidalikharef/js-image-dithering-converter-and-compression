import test from 'node:test';
import assert from 'node:assert/strict';
import {
  outputDimensions,
  processingDimensions,
  ditherToTransparentBlack,
  formatBytes
} from '../core.mjs';

function rgba(...pixels) {
  return {width: pixels.length, height: 1, data: new Uint8ClampedArray(pixels.flatMap(([r, g, b, a = 255]) => [r, g, b, a]))};
}

function alphaOf(result) {
  return Array.from({length: result.width * result.height}, (_, pixel) => result.data[pixel * 4 + 3]);
}

test('output dimensions preserve the source aspect ratio', () => {
  assert.deepEqual(outputDimensions(600, 400, 1200), {width: 1200, height: 800});
  assert.deepEqual(outputDimensions(100, 200, 1200), {width: 1200, height: 2400});
  assert.deepEqual(outputDimensions(3, 2, 300), {width: 300, height: 200});
});

test('grain size produces a smaller logical processing grid', () => {
  assert.deepEqual(processingDimensions(1200, 800, 4), {width: 300, height: 200});
  assert.deepEqual(processingDimensions(11, 9, 4), {width: 3, height: 3});
  assert.deepEqual(processingDimensions(2, 1, 16), {width: 1, height: 1});
});

test('Rec. 709 grayscale luminance separates primary colors', () => {
  const result = ditherToTransparentBlack(rgba([255, 0, 0], [0, 255, 0], [0, 0, 255]), {strength: 0});
  assert.deepEqual(alphaOf(result), [255, 0, 255]);
});

test('threshold quantizes values below it to black and values at it to transparent', () => {
  assert.deepEqual(alphaOf(ditherToTransparentBlack(rgba([127, 127, 127]), {threshold: 128})), [255]);
  assert.deepEqual(alphaOf(ditherToTransparentBlack(rgba([128, 128, 128]), {threshold: 128})), [0]);
});

test('Floyd–Steinberg error diffuses to the next pixel without clamping', () => {
  const input = rgba([100, 100, 100], [100, 100, 100]);
  assert.deepEqual(alphaOf(ditherToTransparentBlack(input)), [255, 0]);
  assert.deepEqual(alphaOf(ditherToTransparentBlack(input, {strength: 0})), [255, 255]);
});

test('Floyd–Steinberg diffusion reaches lower neighbors', () => {
  const vertical = {
    width: 1,
    height: 2,
    data: new Uint8ClampedArray([100, 100, 100, 255, 100, 100, 100, 255])
  };
  const diagonals = {
    width: 2,
    height: 2,
    data: new Uint8ClampedArray([
      255, 255, 255, 255, 100, 100, 100, 255,
      235, 235, 235, 255, 124, 124, 124, 255
    ])
  };
  assert.deepEqual(alphaOf(ditherToTransparentBlack(vertical)), [255, 0]);
  assert.deepEqual(alphaOf(ditherToTransparentBlack(diagonals)), [0, 255, 0, 0]);
});

test('white and fully transparent source pixels become transparent', () => {
  const result = ditherToTransparentBlack(rgba([255, 255, 255], [0, 0, 0, 0], [0, 0, 0]));
  assert.deepEqual(alphaOf(result), [0, 0, 255]);
  assert.deepEqual(Array.from(result.data.slice(0, 4)), [0, 0, 0, 0]);
  assert.deepEqual(Array.from(result.data.slice(8, 12)), [0, 0, 0, 255]);
});

test('contrast changes the luminance presented to the threshold', () => {
  const input = rgba([100, 100, 100]);
  assert.deepEqual(alphaOf(ditherToTransparentBlack(input, {threshold: 128, contrast: 1})), [255]);
  assert.deepEqual(alphaOf(ditherToTransparentBlack(input, {threshold: 128, contrast: 0})), [0]);
});

test('invalid dimensions, pixel data, and settings are rejected', () => {
  assert.throws(() => outputDimensions(0, 100, 1200), RangeError);
  assert.throws(() => outputDimensions(100, 100, 0.1), RangeError);
  assert.throws(() => processingDimensions(0, 100, 4), RangeError);
  assert.throws(() => processingDimensions(100, 100, 1.5), RangeError);
  assert.throws(() => ditherToTransparentBlack({width: 0, height: 1, data: []}), RangeError);
  assert.throws(() => ditherToTransparentBlack({width: 1, height: 1, data: []}), RangeError);
  assert.throws(() => ditherToTransparentBlack(rgba([0, 0, 0]), {threshold: 300}), RangeError);
  assert.throws(() => ditherToTransparentBlack(rgba([0, 0, 0]), {strength: 2}), RangeError);
});

test('byte formatting uses bytes and kibibytes', () => {
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(1024), '1.0 KiB');
});

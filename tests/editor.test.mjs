import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_GEOMETRY,
  applyGeometryOperation,
  geometryLabel,
  isIdentityGeometry,
  transformedDimensions,
  validateGeometry,
  transformImage
} from '../src/editor/transforms.mjs';
import {adjustmentsFromSettings, isNeutralAdjustments, normalizeUiAdjustments} from '../src/editor/adjustments.mjs';
import {createHistory} from '../src/engine/history.mjs';
import {processEditorImage} from '../src/editor/pipeline.mjs';
import {BUILT_IN_PRESETS, createPresetStore} from '../src/editor/presets.mjs';
import {clearSession, loadSession, saveSession} from '../src/editor/session.mjs';
import {PreviewScheduler} from '../src/editor/preview-scheduler.mjs';
import {runWorkerOperation} from '../src/workers/image-worker.mjs';
import {DEFAULT_ADJUSTMENTS as ENGINE_DEFAULT_ADJUSTMENTS} from '../src/engine/color/color-adjustments.mjs';

function image(width, height, pixelAt) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      data.set(pixelAt(x, y), (y * width + x) * 4);
    }
  }
  return {data, width, height};
}

test('editor geometry validates canonical transforms and never mutates sources', () => {
  assert.deepEqual(DEFAULT_GEOMETRY, {rotation: 0, mirrored: false});
  assert.equal(isIdentityGeometry(DEFAULT_GEOMETRY), true);
  assert.deepEqual(transformedDimensions(100, 50, {rotation: 90, mirrored: false}), {width: 50, height: 100});
  assert.deepEqual(transformedDimensions(100, 50, DEFAULT_GEOMETRY), {width: 100, height: 50});
  assert.equal(validateGeometry({rotation: 90, mirrored: false}).rotation, 90);
  assert.throws(() => validateGeometry({rotation: 45}), RangeError);
  assert.equal(geometryLabel({rotation: 0, mirrored: false}), 'Original orientation');

  const source = image(2, 1, (x) => (x === 0 ? [10, 20, 30, 255] : [200, 220, 230, 255]));
  const original = source.data.slice();
  const rotated = transformImage(source, {rotation: 90, mirrored: false});
  assert.equal(rotated.width, 1);
  assert.equal(rotated.height, 2);
  assert.deepEqual(source.data, original);
  assert.deepEqual(applyGeometryOperation({rotation: 90, mirrored: false}, 'rotate-ccw'), {rotation: 0, mirrored: false});
  assert.deepEqual(applyGeometryOperation({rotation: 0, mirrored: false}, 'flip-h'), {rotation: 0, mirrored: true});
  assert.deepEqual(applyGeometryOperation({rotation: 0, mirrored: false}, 'reset'), DEFAULT_GEOMETRY);
});

test('editor adjustments normalize user ranges and preserve neutral behavior', () => {
  const neutral = adjustmentsFromSettings({});
  assert.deepEqual(neutral, ENGINE_DEFAULT_ADJUSTMENTS);
  assert.equal(isNeutralAdjustments(neutral), true);
  const adjusted = adjustmentsFromSettings({
    brightness: 50,
    contrast: -20,
    saturation: 10,
    exposure: 1,
    gamma: 2,
    hue: 30,
    grayscale: true,
    invert: true
  });
  assert.equal(adjusted.brightness, 0.5);
  assert.equal(adjusted.contrast, 0.8);
  assert.equal(adjusted.saturation, 1.1);
  assert.equal(adjusted.exposure, 1);
  assert.equal(adjusted.gamma, 2);
  assert.equal(adjusted.hue, 30);
  assert.equal(adjusted.grayscale, true);
  assert.equal(adjusted.invert, true);
  assert.equal(isNeutralAdjustments(adjusted), false);
  const normalized = normalizeUiAdjustments({brightness: 200, contrast: -200, saturation: -200});
  assert.equal(normalized.brightness, 100);
  assert.equal(normalized.contrast, -100);
  assert.equal(normalized.saturation, -100);
});

test('editor history coalesces rapid slider commits and restores intermediate states', () => {
  const history = createHistory({value: 0});
  assert.equal(history.push({value: 1}, {coalesceKey: 'brightness', coalesceMs: 1000}), true);
  assert.equal(history.push({value: 2}, {coalesceKey: 'brightness', coalesceMs: 1000}), true);
  assert.deepEqual(history.current, {value: 2});
  assert.equal(history.size, 1);
  assert.deepEqual(history.undo(), {value: 0});
  assert.deepEqual(history.redo(), {value: 2});
});

test('editor pipeline applies geometry before deterministic dithering and preserves source pixels', () => {
  const source = image(2, 1, (x) => [x * 100, x * 100, x * 100, 255]);
  const original = source.data.slice();
  const output = processEditorImage(source, {
    mode: 'monochrome',
    algorithm: 'bayer',
    options: {threshold: 128}
  });
  assert.equal(output.width, 2);
  assert.equal(output.height, 1);
  assert.deepEqual(source.data, original);

  const rotated = processEditorImage(source, {
    geometry: {rotation: 90, mirrored: false},
    mode: 'monochrome',
    algorithm: 'bayer',
    options: {threshold: 128}
  });
  assert.equal(rotated.width, 1);
  assert.equal(rotated.height, 2);
});

test('editor preset store saves, lists, and removes custom presets', () => {
  const storage = {
    items: new Map(),
    getItem(key) { return this.items.get(key) ?? null; },
    setItem(key, value) { this.items.set(key, String(value)); },
    removeItem(key) { this.items.delete(key); }
  };
  const store = createPresetStore({storage});
  const list = store.list();
  assert.ok(list.length >= BUILT_IN_PRESETS.length);
  const saved = store.add('Editor Test', {mode: 'monochrome', algorithm: 'floyd-steinberg'});
  assert.equal(store.get(saved.preset.id).name, 'Editor Test');
  assert.equal(store.remove(saved.preset.id), true);
});

test('editor session persists normalized state and tolerates storage failures', () => {
  const storage = {
    items: new Map(),
    getItem(key) { return this.items.get(key) ?? null; },
    setItem(key, value) { this.items.set(key, String(value)); },
    removeItem(key) { this.items.delete(key); }
  };
  const state = {
    settings: {algorithm: 'floyd-steinberg', mode: 'monochrome'},
    geometry: {rotation: 90, mirrored: false},
    view: 'side-by-side',
    theme: 'light'
  };
  assert.equal(saveSession(state, storage), true);
  const loaded = loadSession(storage);
  assert.equal(loaded.schemaVersion, 1);
  assert.deepEqual(loaded.geometry, {rotation: 90, mirrored: false});
  assert.equal(loaded.view, 'side-by-side');
  assert.equal(loaded.theme, 'light');
  assert.equal(clearSession(storage), true);
  assert.equal(loadSession(storage), null);

  storage.getItem = () => '{corrupt';
  assert.equal(loadSession(storage), null);
});

test('preview scheduler resolves superseded requests as stale and reports failures', async () => {
  const scheduler = new PreviewScheduler({delay: 0});
  const first = scheduler.schedule(() => Promise.resolve('first'));
  const second = scheduler.schedule(() => Promise.resolve('second'));
  const third = scheduler.schedule(() => Promise.resolve('third'));
  assert.equal((await first.promise).status, 'stale');
  const secondResult = await second.promise;
  assert.equal(secondResult.status, 'stale');
  assert.deepEqual((await third.promise).value, 'third');
  assert.equal((await third.promise).status, 'applied');

  const failing = scheduler.schedule(() => Promise.reject(new Error('worker failed')));
  const failure = await failing.promise;
  assert.equal(failure.status, 'failed');
  assert.equal(failure.error.message, 'worker failed');
});

test('worker supports the editor processing operation', () => {
  const source = image(2, 1, (x) => [x * 100, x * 100, x * 100, 255]);
  const result = runWorkerOperation({
    type: 'process-editor-image',
    payload: {
      width: 2,
      height: 1,
      buffer: source.data.buffer,
      mode: 'monochrome',
      algorithm: 'bayer',
      options: {threshold: 128},
      adjustments: ENGINE_DEFAULT_ADJUSTMENTS
    }
  });
  assert.equal(result.width, 2);
  assert.equal(result.height, 1);
  assert.equal(result.buffer.byteLength, 8);
});

import {outputDimensions, processingDimensions, ditherToTransparentBlack, formatBytes} from './core.mjs';

const $ = id => document.getElementById(id);
const controls = ['width', 'grain', 'threshold', 'contrast', 'strength', 'quality'];
const defaults = {width:1200, grain:4, threshold:128, contrast:1, strength:1, quality:.75};
const undoStack = [];
const redoStack = [];
const historyLimit = 50;
let source = null;
let sourceName = 'image';
let sourceFileSize = 0;
let latestBlob = null;
let renderSerial = 0;
let debounceTimer;
let zoom = 1;
let fitZoom = true;
let lastCommittedSettings = {...defaults};

function getSettings() {
  return Object.fromEntries(controls.map(id => [id, Number($(id).value)]));
}

function sameSettings(a, b) {
  return controls.every(id => a[id] === b[id]);
}

function updateHistoryButtons() {
  $('undo').disabled = undoStack.length === 0;
  $('redo').disabled = redoStack.length === 0;
}

function commitSettings() {
  const current = getSettings();
  if (sameSettings(current, lastCommittedSettings)) return;
  undoStack.push({...lastCommittedSettings});
  if (undoStack.length > historyLimit) undoStack.shift();
  redoStack.length = 0;
  lastCommittedSettings = current;
  updateHistoryButtons();
}

function applySettings(settings) {
  for (const id of controls) $(id).value = settings[id];
  lastCommittedSettings = {...settings};
  updateLabels();
  updateHistoryButtons();
  scheduleRender();
}

function updateLabels() {
  $('widthValue').textContent = `${$('width').value} px`;
  $('grainValue').textContent = `${$('grain').value} × ${$('grain').value} px`;
  $('thresholdValue').textContent = $('threshold').value;
  $('contrastValue').textContent = `${Number($('contrast').value).toFixed(1)}×`;
  $('strengthValue').textContent = `${Math.round(Number($('strength').value)*100)}%`;
  $('qualityValue').textContent = `${Math.round(Number($('quality').value)*100)}%`;
}

function canvasToWebP(canvas, quality) {
  return new Promise((resolve,reject)=>{
    canvas.toBlob(blob => {
      if (!blob) return reject(new Error('Canvas export failed.'));
      if (blob.type !== 'image/webp') return reject(new Error(`Browser did not encode WebP (returned ${blob.type || 'unknown'}). Try a browser with WebP canvas encoding support.`));
      resolve(blob);
    }, 'image/webp', quality);
  });
}

async function loadImage(file) {
  if (!file || (!file.type.startsWith('image/') && !/\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name))) throw new Error('Choose a supported image file.');
  if (file.size > 40 * 1024 * 1024) throw new Error('Image exceeds the 40 MiB input limit.');
  if (typeof createImageBitmap === 'function') return await createImageBitmap(file, {imageOrientation:'from-image'});
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Image could not be decoded.'));
      img.src = url;
    });
  } finally {URL.revokeObjectURL(url);}
}

function updateCanvasZoom() {
  if (!source) return;
  const wrap = $('canvasWrap');
  if (fitZoom) {
    const availableWidth = Math.max(100, wrap.clientWidth - 64);
    const availableHeight = Math.max(100, wrap.clientHeight - 80);
    zoom = Math.min(1, availableWidth / $('outputCanvas').width, availableHeight / $('outputCanvas').height);
  }
  const width = Math.max(1, Math.round($('outputCanvas').width * zoom));
  const height = Math.max(1, Math.round($('outputCanvas').height * zoom));
  $('canvasStage').style.width = `${width}px`;
  $('canvasStage').style.height = `${height}px`;
  for (const id of ['originalCanvas', 'outputCanvas']) {
    $(id).style.width = `${width}px`;
    $(id).style.height = `${height}px`;
  }
  $('zoomValue').textContent = fitZoom ? 'Fit' : `${Math.round(zoom * 100)}%`;
}

function setView(mode) {
  $('canvasStage').dataset.view = mode;
  for (const button of document.querySelectorAll('.view-tab')) {
    const active = button.dataset.view === mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  const comparing = mode === 'compare';
  $('compareControl').hidden = !comparing;
  $('compareLine').hidden = !comparing;
  if (!comparing) $('outputCanvas').style.clipPath = 'inset(0 0 0 0)';
  updateComparison();
}

function updateComparison() {
  const value = Number($('compare').value);
  const isComparing = $('canvasStage').dataset.view === 'compare';
  $('outputCanvas').style.clipPath = isComparing ? `inset(0 ${100-value}% 0 0)` : 'inset(0 0 0 0)';
  $('compareLine').style.left = `${value}%`;
  $('compareValue').textContent = `${value}%`;
}

async function render() {
  const serial = ++renderSerial;
  latestBlob = null;
  $('download').disabled = true;
  if (!source) return;
  const settings = getSettings();
  $('status').textContent = 'Rendering image…';
  $('statusDot').className = 'processing';
  try {
    const dimensions = outputDimensions(source.width, source.height, settings.width);
    if (dimensions.width > 32_767 || dimensions.height > 32_767 || dimensions.width * dimensions.height > 50_000_000) {
      throw new Error('Output exceeds the supported canvas size. Reduce the output width or use a less extreme aspect ratio.');
    }
    const logical = processingDimensions(dimensions.width, dimensions.height, settings.grain);
    const low = document.createElement('canvas');
    low.width = logical.width;
    low.height = logical.height;
    const lowContext = low.getContext('2d', {willReadFrequently:true});
    if (!lowContext) throw new Error('Could not initialize the processing canvas.');
    lowContext.drawImage(source, 0, 0, logical.width, logical.height);
    const pixels = lowContext.getImageData(0, 0, logical.width, logical.height);
    const dithered = ditherToTransparentBlack(pixels, settings);
    lowContext.putImageData(new ImageData(dithered.data, logical.width, logical.height), 0, 0);

    const originalCanvas = $('originalCanvas');
    const outputCanvas = $('outputCanvas');
    originalCanvas.width = outputCanvas.width = dimensions.width;
    originalCanvas.height = outputCanvas.height = dimensions.height;
    const originalContext = originalCanvas.getContext('2d');
    const outputContext = outputCanvas.getContext('2d');
    if (!originalContext || !outputContext) throw new Error('Could not initialize the preview canvas.');
    originalContext.clearRect(0, 0, dimensions.width, dimensions.height);
    originalContext.drawImage(source, 0, 0, dimensions.width, dimensions.height);
    outputContext.clearRect(0, 0, dimensions.width, dimensions.height);
    outputContext.imageSmoothingEnabled = false;
    outputContext.drawImage(low, 0, 0, dimensions.width, dimensions.height);

    const blob = await canvasToWebP(outputCanvas, settings.quality);
    if (serial !== renderSerial) return;
    latestBlob = blob;
    $('placeholder').hidden = true;
    $('canvasStage').hidden = false;
    $('dimensions').textContent = `${dimensions.width} × ${dimensions.height}`;
    $('imageInfo').textContent = `${source.width} × ${source.height} px · ${formatBytes(sourceFileSize)}`;
    $('filesize').textContent = formatBytes(blob.size);
    $('target').textContent = blob.size < 30 * 1024 ? 'Under target' : 'Above target';
    $('target').className = blob.size < 30 * 1024 ? 'target-good' : '';
    $('download').disabled = false;
    $('zoomOut').disabled = false;
    $('zoomValue').disabled = false;
    $('zoomIn').disabled = false;
    $('status').textContent = `Ready · ${formatBytes(blob.size)} WebP`;
    $('statusDot').className = 'ready';
    updateCanvasZoom();
    setView($('canvasStage').dataset.view || 'processed');
  } catch(error) {
    if (serial !== renderSerial) return;
    $('status').textContent = error instanceof Error ? error.message : 'Rendering failed.';
    $('statusDot').className = 'error';
    $('dimensions').textContent = '—';
    $('filesize').textContent = '—';
    $('target').textContent = '—';
    $('target').className = '';
    $('placeholder').hidden = false;
    $('canvasStage').hidden = true;
    $('zoomOut').disabled = true;
    $('zoomValue').disabled = true;
    $('zoomIn').disabled = true;
  }
}

function scheduleRender() {
  ++renderSerial;
  latestBlob = null;
  $('download').disabled = true;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(render, 130);
}

function resetSettings() {
  commitSettings();
  const current = getSettings();
  if (sameSettings(current, defaults)) return;
  undoStack.push({...current});
  if (undoStack.length > historyLimit) undoStack.shift();
  redoStack.length = 0;
  applySettings(defaults);
}

for (const id of controls) {
  $(id).addEventListener('input', () => {updateLabels(); scheduleRender();});
  $(id).addEventListener('change', commitSettings);
}
$('reset').addEventListener('click', resetSettings);
$('resetProperties').addEventListener('click', resetSettings);
$('undo').addEventListener('click', () => {
  commitSettings();
  const previous = undoStack.pop();
  if (!previous) return;
  redoStack.push(getSettings());
  applySettings(previous);
});
$('redo').addEventListener('click', () => {
  commitSettings();
  const next = redoStack.pop();
  if (!next) return;
  undoStack.push(getSettings());
  applySettings(next);
});

async function chooseFile(file) {
  if (!file) return;
  ++renderSerial;
  clearTimeout(debounceTimer);
  latestBlob = null;
  $('download').disabled = true;
  $('status').textContent = 'Decoding image…';
  $('statusDot').className = 'processing';
  const token = renderSerial;
  try {
    const image = await loadImage(file);
    if (token !== renderSerial) {
      if (typeof image.close === 'function') image.close();
      return;
    }
    if (image.width * image.height > 50_000_000) {
      if (typeof image.close === 'function') image.close();
      throw new Error('Image exceeds the 50 megapixel input limit.');
    }
    if (source && typeof source.close === 'function') source.close();
    source = image;
    sourceFileSize = file.size;
    sourceName = file.name;
    $('filename').textContent = file.name;
    $('sourceName').textContent = `${file.name} · ${formatBytes(file.size)}`;
    $('imageInfo').textContent = `${image.width} × ${image.height} px · ${formatBytes(file.size)}`;
    await render();
  } catch(error) {
    if (token !== renderSerial) return;
    $('status').textContent = error instanceof Error ? error.message : 'Failed to read image.';
    $('statusDot').className = 'error';
  }
}

$('file').addEventListener('change', event => {
  chooseFile(event.target.files?.[0]);
  event.target.value = '';
});
for (const name of ['dragenter', 'dragover']) $('dropzone').addEventListener(name, event => {
  event.preventDefault();
  $('dropzone').classList.add('dragover');
});
for (const name of ['dragleave', 'drop']) $('dropzone').addEventListener(name, event => {
  event.preventDefault();
  $('dropzone').classList.remove('dragover');
});
$('dropzone').addEventListener('drop', event => chooseFile(event.dataTransfer?.files?.[0]));
$('download').addEventListener('click', () => {
  if (!latestBlob) return;
  const url = URL.createObjectURL(latestBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = sourceName.replace(/\.[^.]+$/, '') + '-dithered.webp';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
});

for (const button of document.querySelectorAll('.view-tab')) {
  button.addEventListener('click', () => setView(button.dataset.view));
}
$('compare').addEventListener('input', updateComparison);
$('zoomIn').addEventListener('click', () => {
  fitZoom = false;
  zoom = Math.min(4, zoom * 1.25);
  updateCanvasZoom();
});
$('zoomOut').addEventListener('click', () => {
  fitZoom = false;
  zoom = Math.max(.1, zoom / 1.25);
  updateCanvasZoom();
});
$('zoomValue').addEventListener('click', () => {
  fitZoom = true;
  updateCanvasZoom();
});
$('theme').addEventListener('click', () => {
  const light = document.documentElement.dataset.theme !== 'light';
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
  $('brandLogo').src = light ? 'assets/dither-orbit-lockup-light.svg' : 'assets/dither-orbit-lockup-dark.svg';
  document.querySelector('meta[name="theme-color"]').content = light ? '#F3F5F2' : '#0B0D0E';
  $('theme').setAttribute('aria-label', light ? 'Switch to dark theme' : 'Switch to light theme');
});
window.addEventListener('resize', () => {if (fitZoom) updateCanvasZoom();});
window.addEventListener('keydown', event => {
  const modifier = event.ctrlKey || event.metaKey;
  if (modifier && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    (event.shiftKey ? $('redo') : $('undo')).click();
  } else if (modifier && event.key.toLowerCase() === 'y') {
    event.preventDefault();
    $('redo').click();
  } else if (modifier && event.key.toLowerCase() === 'r') {
    event.preventDefault();
    resetSettings();
  } else if (modifier && event.key.toLowerCase() === 'e') {
    event.preventDefault();
    $('download').click();
  }
});

updateLabels();
updateHistoryButtons();

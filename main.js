import {outputDimensions, processingDimensions, formatBytes} from './core.mjs';
import {ALGORITHMS, getAlgorithm, processImage} from './src/engine/registry.mjs';
import {PRESETS, getPreset} from './src/engine/presets.mjs';
import {createHistory} from './src/engine/history.mjs';
import {
  processColorImage, BUILT_IN_PALETTES, PALETTE_CATEGORIES, getPalette, createCustomPalette,
  updateCustomPalette, loadPalettes, savePalettes, parsePaletteJSON, serializePaletteJSON,
  extractPalette, COLOR_PRESETS, getColorPreset, validatePaletteColors, hexToRGB, rgbToHex,
  DEFAULT_ADJUSTMENTS
} from './src/engine/index.mjs';
import {createImageProcessor} from './src/workers/worker-client.mjs';
import {JobScheduler} from './src/workers/job-scheduler.mjs';
import {encodeCanvas, detectExportCapabilities, EXPORT_FORMATS} from './src/export/formats.mjs';
import {findClosestTargetSize, parseTargetBytes} from './src/export/target-size.mjs';
import {safeOutputFilename} from './src/export/filename.mjs';
import {BatchQueue} from './src/batch/batch-queue.mjs';
import {createStoredZip} from './src/batch/zip-writer.mjs';
import {ResourceManager} from './src/utilities/resource-manager.mjs';
import {DEFAULT_GEOMETRY, applyGeometryOperation, geometryLabel, isIdentityGeometry, transformedDimensions, validateGeometry} from './src/editor/transforms.mjs';
import {DEFAULT_SETTINGS, normalizeSettings} from './src/editor/state.mjs';
import {adjustmentsFromSettings} from './src/editor/adjustments.mjs';
import {createPresetStore} from './src/editor/presets.mjs';
import {createSessionStore} from './src/editor/session.mjs';

const $ = id => document.getElementById(id);
const controls = ['width', 'grain', 'threshold', 'contrast', 'strength', 'quality', 'algorithm', 'matrixSize', 'orderedStrength', 'seed', 'randomness', 'serpentine', 'preset', 'mode', 'paletteId', 'distanceMethod', 'alphaMode', 'background', 'brightness', 'adjustContrast', 'saturation', 'gamma', 'exposure', 'hue', 'temperature', 'tint', 'grayscale', 'invert'];
const MAX_OUTPUT_PIXELS=20_000_000;
const defaults = {...DEFAULT_SETTINGS, geometry:{...DEFAULT_GEOMETRY}};
const history = createHistory(defaults);
const presetStore = createPresetStore();
const sessionStore = createSessionStore();
let geometry = {...DEFAULT_GEOMETRY};
let applyingSettings = false;
let spacePressed = false;
let panState = null;
let holdingOriginal = false;
let activePalette = getPalette('black-white');
let customPalettes = loadPalettes();
let extractionDuration = 0;
let comparisonCache = new Map();
let sourceRevision = 0;
let source = null;
let sourceName = 'image';
let sourceFileSize = 0;
let latestBlob = null;
let renderSerial = 0;
let debounceTimer;
let zoom = 1;
let fitZoom = true;
let processingDuration = 0;
let encodingDuration = 0;
let decodeDuration = 0;
let comparisonSerial = 0;
const resources = new ResourceManager();
let executionMode = '—';
let activePreviewJob = null;
let activeComparisonJobs = [];
let activeExportController = null;
let activeExtractionJob=null;
let exportCapabilities = null;
const processor = createImageProcessor({onExecutionMode:mode=>{
  executionMode=mode==='worker'?'Web Worker':'Main-thread fallback';
  if($('executionMode'))$('executionMode').textContent=executionMode;
}});
const jobScheduler = new JobScheduler({concurrency:2});
let batchQueue = null;
const batchObjectUrls = new Map();
let batchRetainedOutputBytes=0;
const batchOutputReservations=new Map();

function getSettings() {
  const settings = Object.fromEntries(controls.map(id => {
    const element = $(id);
    if (!element) return [id, defaults[id]];
    if (element.type === 'checkbox') return [id, element.checked];
    if (['algorithm','preset','mode','paletteId','distanceMethod','alphaMode','background'].includes(id)) return [id, element.value];
    return [id, Number(element.value)];
  }));
  settings.paletteName = activePalette.name;
  settings.paletteColors = activePalette.colors.slice();
  settings.geometry = {...geometry};
  return settings;
}

function drawSourceTransformed(context, image, value, width, height) {
  const transform = validateGeometry(value);
  const swapped = transform.rotation === 90 || transform.rotation === 270;
  const drawWidth = swapped ? height : width;
  const drawHeight = swapped ? width : height;
  context.save();
  context.translate(width / 2, height / 2);
  context.rotate(transform.rotation * Math.PI / 180);
  if (transform.mirrored) context.scale(-1, 1);
  context.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  context.restore();
}

function scheduleSessionSave() {
  if (applyingSettings) return;
  sessionStore.schedule({
    settings: getSettings(),
    geometry,
    view: $('canvasStage').dataset.view || 'processed',
    theme: document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
  });
}

function readSourcePixels(maxSide=512) {
  if(!source) throw new Error('Import an image before extracting colors.');
  const scale=Math.min(1,maxSide/source.width,maxSide/source.height);
  const width=Math.max(1,Math.round(source.width*scale));
  const height=Math.max(1,Math.round(source.height*scale));
  const canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d',{willReadFrequently:true});
  if(!context)throw new Error('Could not initialize the palette extraction canvas.');
  context.drawImage(source,0,0,width,height);
  return context.getImageData(0,0,width,height);
}

function sameSettings(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function updateHistoryButtons() {
  $('undo').disabled = !history.canUndo;
  $('redo').disabled = !history.canRedo;
}

function commitSettings(options = {}) {
  if (applyingSettings) return;
  const current = getSettings();
  if (!history.push(current, options)) return;
  updateHistoryButtons();
  scheduleSessionSave();
}

function applySettings(settings) {
  applyingSettings = true;
  try {
    for (const id of controls) {
      const element = $(id);
      if (!element) continue;
      if (element.type === 'checkbox') element.checked = !!settings[id];
      else element.value = settings[id] ?? defaults[id];
    }
    if (settings.geometry) geometry = validateGeometry(settings.geometry);
    const paletteId = settings.paletteId ?? 'black-white';
    let paletteColors = settings.paletteColors;
    if (!Array.isArray(paletteColors) || paletteColors.length < 2) {
      try { paletteColors = getPalette(paletteId).colors.slice(); }
      catch { paletteColors = activePalette.colors.slice(); }
    }
    activePalette = {
      id:paletteId,
      name:settings.paletteName ?? 'Black and White',
      colors:paletteColors.slice(),
      category:'Custom',description:'Current processing palette.',colorCount:paletteColors.length,
      editable:true,builtIn:false
    };
    if (BUILT_IN_PALETTES.some(item => item.id === activePalette.id)) activePalette = getPalette(activePalette.id);
    $('editorPreset').value = '';
    refreshPaletteSelector();
    renderPaletteEditor();
    updateLabels();
    updateHistoryButtons();
  } finally {
    applyingSettings = false;
  }
  scheduleRender();
  scheduleSessionSave();
}

function updateLabels() {
  $('widthValue').textContent = `${$('width').value} px`;
  $('grainValue').textContent = `${$('grain').value} × ${$('grain').value} px`;
  $('thresholdValue').textContent = $('threshold').value;
  $('contrastValue').textContent = `${Number($('contrast').value).toFixed(1)}×`;
  $('strengthValue').textContent = `${Math.round(Number($('strength').value)*100)}%`;
  $('qualityValue').textContent = `${Math.round(Number($('quality').value)*100)}%`;
  if ($('algorithm')) {
    $('algorithmValue').textContent = $('algorithm').value === 'floyd-steinberg' ? 'Floyd–Steinberg' : $('algorithm').options[$('algorithm').selectedIndex].text;
    const isBayer = $('algorithm').value === 'bayer';
    const isRandom = $('algorithm').value === 'random';
    $('matrixSizeWrap').hidden = !isBayer;
    $('orderedStrengthWrap').hidden = !isBayer;
    $('strengthWrap').hidden = isBayer || isRandom;
    $('randomWrap').hidden = !isRandom;
    $('seedWrap').hidden = !isRandom;
    $('serpentineWrap').hidden = $('algorithm').value === 'bayer' || $('algorithm').value === 'random';
    const algorithm = getAlgorithm($('algorithm').value);
    $('algorithmDescription').textContent = algorithm.description;
    $('algorithmCategory').textContent = algorithm.category;
    $('activeAlgorithmName').textContent = algorithm.name;
    $('activeAlgorithmCategory').textContent = algorithm.category;
    $('activeAlgorithmDescription').textContent = algorithm.description;
  }
  if ($('randomness')) $('randomnessValue').textContent = `${Math.round(Number($('randomness').value)*100)}%`;
  if ($('matrixSize')) $('matrixSizeValue').textContent = `${$('matrixSize').value}×${$('matrixSize').value}`;
  if ($('orderedStrength')) $('orderedStrengthValue').textContent = `${Math.round(Number($('orderedStrength').value)*100)}%`;
  if ($('seed')) $('seedValue').textContent = $('seed').value;
  if ($('mode')) {
    $('colorSettings').hidden = $('mode').value !== 'color';
    $('thresholdWrap').hidden = $('mode').value === 'color';
    $('monoContrastWrap').hidden = $('mode').value === 'color';
    $('backgroundWrap').hidden = $('alphaMode').value !== 'composite';
    $('metricMode').textContent = $('mode').value === 'color' ? 'Full color' : 'Monochrome';
    $('metricColorMethod').textContent = $('mode').value === 'color' ? `${$('distanceMethod').selectedOptions[0].textContent} · ${activePalette.colors.length}` : '—';
    $('paletteDescription').textContent = activePalette.description ?? 'Custom palette.';
    $('paletteCount').textContent = `${activePalette.colors.length} colors`;
  }
  if ($('brightness')) $('brightnessValue').textContent = $('brightness').value;
  if ($('adjustContrast')) $('adjustContrastValue').textContent = $('adjustContrast').value;
  if ($('saturation')) $('saturationValue').textContent = $('saturation').value;
  if ($('gamma')) $('gammaValue').textContent = Number($('gamma').value).toFixed(2);
  if ($('exposure')) $('exposureValue').textContent = `${Number($('exposure').value).toFixed(1)} EV`;
  if ($('hue')) $('hueValue').textContent = `${$('hue').value}°`;
  if ($('temperature')) $('temperatureValue').textContent = Number($('temperature').value).toFixed(2);
  if ($('tint')) $('tintValue').textContent = Number($('tint').value).toFixed(2);
  if ($('geometryLabel')) $('geometryLabel').textContent = geometryLabel(geometry);
}

function updateGeometryLabel() {
  if ($('geometryLabel')) $('geometryLabel').textContent = geometryLabel(geometry);
}

function presetName(id) {
  if(!id)return 'Custom';
  return PRESETS.find(item=>item.id===id)?.name ?? COLOR_PRESETS.find(item=>item.id===id)?.name ?? 'Custom';
}

function resolveAlgorithmSettings(settings) {
  return {
    threshold: settings.threshold,
    contrast: settings.contrast,
    strength: settings.strength,
    serpentine: !!settings.serpentine,
    matrixSize: Number(settings.matrixSize),
    orderedStrength: settings.orderedStrength,
    seed: Number(settings.seed),
    randomness: settings.randomness,
  };
}

function allPalettes() {
  const items = [...BUILT_IN_PALETTES, ...customPalettes];
  if (!items.some(item => item.id === activePalette.id)) items.push(activePalette);
  return items;
}

function refreshPaletteSelector() {
  if (!$('paletteId')) return;
  const category = $('paletteCategory').value;
  const query = $('paletteSearch').value.trim().toLowerCase();
  const items = allPalettes().filter(item =>
    (!category || item.category === category)
    && (!query || `${item.name} ${item.description}`.toLowerCase().includes(query))
  );
  $('paletteId').replaceChildren(...items.map(item => new Option(`${item.name} · ${item.colorCount ?? item.colors.length}`, item.id)));
  if (!items.some(item => item.id === activePalette.id)) {
    $('paletteId').add(new Option(activePalette.name, activePalette.id));
  }
  $('paletteId').value = activePalette.id;
  for (const id of ['comparePaletteA','comparePaletteB']) {
    if (!$(`${id}`)) continue;
    const select = $(id);
    const selected = select.value;
    select.replaceChildren(...allPalettes().map(item => new Option(item.name, item.id)));
    select.value = allPalettes().some(item => item.id === selected) ? selected : activePalette.id;
  }
}

function updatePaletteSwatches() {
  const host = $('paletteSwatches');
  if (!host) return;
  host.replaceChildren(...activePalette.colors.map((hex,index) => {
    const swatch = document.createElement('span');
    swatch.className = 'palette-swatch';
    swatch.style.backgroundColor = hex;
    swatch.title = `${index + 1}: ${hex}`;
    swatch.setAttribute('aria-label', hex);
    return swatch;
  }));
}

function renderPaletteEditor() {
  if (!$('paletteSwatches')) return;
  updatePaletteSwatches();
  $('customPaletteName').value = activePalette.name;
  const host = $('paletteColorList');
  host.replaceChildren();
  activePalette.colors.forEach((hex,index) => {
    const row = document.createElement('div');
    row.className = 'palette-color-row';
    const picker = document.createElement('input');
    picker.type = 'color'; picker.value = hex; picker.setAttribute('aria-label',`Choose color ${index+1}`);
    picker.addEventListener('input', () => updatePaletteColor(index,picker.value,false));
    picker.addEventListener('change', () => commitSettings());
    const text = document.createElement('input');
    text.type='text'; text.value=hex; text.maxLength=7; text.setAttribute('aria-label',`Hex value for color ${index+1}`);
    text.addEventListener('change', () => {
      try { updatePaletteColor(index,rgbToHex(hexToRGB(text.value)),true); }
      catch(error) { showPaletteMessage(error.message); text.value=activePalette.colors[index]; }
    });
    const up=document.createElement('button');up.type='button';up.className='text-button';up.textContent='↑';up.disabled=index===0;up.setAttribute('aria-label',`Move color ${index+1} up`);
    up.addEventListener('click',()=>movePaletteColor(index,index-1));
    const down=document.createElement('button');down.type='button';down.className='text-button';down.textContent='↓';down.disabled=index===activePalette.colors.length-1;down.setAttribute('aria-label',`Move color ${index+1} down`);
    down.addEventListener('click',()=>movePaletteColor(index,index+1));
    const remove=document.createElement('button');remove.type='button';remove.className='text-button';remove.textContent='×';remove.disabled=activePalette.colors.length<=2;remove.setAttribute('aria-label',`Remove color ${index+1}`);
    remove.addEventListener('click',()=>removePaletteColor(index));
    row.append(picker,text,up,down,remove);
    host.append(row);
  });
  $('deletePalette').disabled=!customPalettes.some(item=>item.id===activePalette.id);
  $('resetPalette').disabled=!customPalettes.some(item=>item.id===activePalette.id);
  $('paletteCount').textContent=`${activePalette.colors.length} colors`;
  refreshPaletteSelector();
}

function showPaletteMessage(message) {
  $('paletteMessage').textContent=message;
}

function setActivePalette(palette,{historyEntry=true}={}) {
  $('preset').value='';
  activePalette={...palette,colors:palette.colors.slice(),colorCount:palette.colors.length};
  $('paletteId').value=activePalette.id;
  renderPaletteEditor();
  updateLabels();
  if(historyEntry) commitSettings();
  scheduleRender();
}

function updatePaletteColor(index,hex,renderList=true) {
  const colors=activePalette.colors.slice();
  colors[index]=hex;
  try { activePalette={...activePalette,colors:validatePaletteColors(colors),colorCount:colors.length}; }
  catch(error) {
    if(error instanceof RangeError && /duplicates/.test(error.message)) showPaletteMessage('Each palette color must be unique.');
    else throw error;
    renderPaletteEditor();
    return;
  }
  $('preset').value='';
  if(renderList) renderPaletteEditor(); else updatePaletteSwatches();
  updateLabels();
  scheduleRender();
  if(renderList)commitSettings();
}

function movePaletteColor(from,to) {
  $('preset').value='';
  const colors=activePalette.colors.slice();
  [colors[from],colors[to]]=[colors[to],colors[from]];
  activePalette={...activePalette,colors};
  renderPaletteEditor();commitSettings();scheduleRender();
}

function removePaletteColor(index) {
  if(activePalette.colors.length<=2)return;
  $('preset').value='';
  activePalette={...activePalette,colors:activePalette.colors.filter((_,position)=>position!==index)};
  renderPaletteEditor();commitSettings();scheduleRender();
}

function persistCustomPalettes() {
  const saved=savePalettes(customPalettes);
  if(!saved) {
    showPaletteMessage('Browser storage is full or unavailable. Export the palette JSON to keep a copy.');
    return false;
  }
  refreshPaletteSelector();
  renderPaletteEditor();
  return true;
}

function saveActivePalette() {
  try {
    $('preset').value='';
    const previousPalettes=customPalettes.slice();
    const existing=customPalettes.findIndex(item=>item.id===activePalette.id);
    const saved=existing>=0
      ? updateCustomPalette(customPalettes[existing],{name:$('customPaletteName').value,colors:activePalette.colors})
      : createCustomPalette($('customPaletteName').value,activePalette.colors);
    if(existing>=0) customPalettes[existing]=saved;
    else customPalettes.push(saved);
    const old=activePalette;
    activePalette=saved;
    $('paletteId').value=saved.id;
    if(!persistCustomPalettes()) {
      activePalette=old;
      customPalettes=previousPalettes;
      renderPaletteEditor();
    }
    else {showPaletteMessage('Palette saved on this device.');commitSettings();scheduleRender();}
  } catch(error) { showPaletteMessage(error.message); }
}

function applyColorPreset(presetId) {
  const preset=getColorPreset(presetId);
  $('preset').value=preset.id;
  $('editorPreset').value='';
  const next={...getSettings(),...preset.settings,preset:preset.id};
  if(preset.settings.paletteId==='adaptive') {
    if(!source) {showPaletteMessage('Import an image before applying Adaptive 8-Color.');return;}
    const image=readSourcePixels(512);
    const result=extractPalette(image,{method:'median-cut',colorCount:8});
    if(result.colors.length<2) {showPaletteMessage('The source has fewer than two distinct visible colors.');return;}
    activePalette={id:'adaptive',name:'Adaptive 8-Color',colors:result.colors,category:'Custom',description:'Median Cut palette generated from this image.',colorCount:result.colors.length,editable:true,builtIn:false};
    next.paletteId=activePalette.id;next.paletteName=activePalette.name;next.paletteColors=activePalette.colors.slice();
    extractionDuration=result.durationMs;$('extractionTime').textContent=`${result.durationMs.toFixed(2)} ms`;
  }     else {
    activePalette=getPalette(preset.settings.paletteId);
    next.paletteId=activePalette.id;next.paletteName=activePalette.name;next.paletteColors=activePalette.colors.slice();
  }
  history.push(next);applySettings(next);
}

function populateSelectors() {
  const algorithmSelect = $('algorithm');
  algorithmSelect.replaceChildren();
  const categories = new Map();
  for (const algorithm of ALGORITHMS) {
    if (!categories.has(algorithm.category)) {
      const group = document.createElement('optgroup');
      group.label = algorithm.category;
      categories.set(algorithm.category, group);
      algorithmSelect.append(group);
    }
    const option = document.createElement('option');
    option.value = algorithm.id;
    option.textContent = algorithm.name;
    option.title = algorithm.description;
    categories.get(algorithm.category).append(option);
  }
  const presetSelect = $('preset');
  presetSelect.replaceChildren(new Option('Custom settings', ''));
  for (const preset of PRESETS) presetSelect.add(new Option(preset.name, preset.id));
  const colorGroup=document.createElement('optgroup');colorGroup.label='Color presets';
  for(const preset of COLOR_PRESETS)colorGroup.append(new Option(preset.name,preset.id));
  presetSelect.append(colorGroup);
  $('paletteCategory').replaceChildren(new Option('All categories',''));
  for(const category of PALETTE_CATEGORIES)$('paletteCategory').add(new Option(category,category));
  refreshPaletteSelector();
  renderPaletteEditor();
}

function applyPreset(presetId) {
  $('preset').value='';
  $('editorPreset').value='';
  if(COLOR_PRESETS.some(item=>item.id===presetId)) {
    applyColorPreset(presetId);
    return;
  }
  const preset = getPreset(presetId);
  const next = {...getSettings(), ...preset.settings, preset:preset.id};
  history.push(next);
  applySettings(next);
}

function populateEditorPresets() {
  const select = $('editorPreset');
  if (!select) return;
  const selected = select.value;
  const presets = presetStore.list();
  select.replaceChildren(new Option('Custom settings', ''));
  const builtInGroup = document.createElement('optgroup');
  builtInGroup.label = 'Built-in';
  const customGroup = document.createElement('optgroup');
  customGroup.label = 'Saved on this device';
  for (const preset of presets) {
    const group = preset.builtIn ? builtInGroup : customGroup;
    group.append(new Option(preset.name, preset.id));
  }
  select.append(builtInGroup, customGroup);
  select.value = presets.some(preset => preset.id === selected) ? selected : '';
  $('deleteEditorPreset').disabled = !presets.some(preset => preset.id === select.value && !preset.builtIn);
}

function updateEditorPresetButtons() {
  const preset = presetStore.get($('editorPreset').value);
  $('deleteEditorPreset').disabled = !preset || preset.builtIn;
}

function applyEditorPreset() {
  const id = $('editorPreset').value;
  updateEditorPresetButtons();
  if (!id) return;
  const preset = presetStore.get(id);
  if (!preset) return;
  const next = {...getSettings(), ...preset.settings, preset:''};
  next.geometry = { ...geometry };
  history.push(next);
  applySettings(next);
  $('editorPreset').value = id;
  updateEditorPresetButtons();
  $('editorPresetMessage').textContent = preset.builtIn
    ? `Applied built-in preset “${preset.name}”.`
    : `Applied saved preset “${preset.name}”.`;
}

function saveEditorPreset() {
  try {
    const name = $('editorPresetName').value.trim() || 'My preset';
    const {preset, saved} = presetStore.add(name, getSettings());
    populateEditorPresets();
    $('editorPreset').value = preset.id;
    $('editorPresetName').value = preset.name;
    updateEditorPresetButtons();
    $('editorPresetMessage').textContent = saved
      ? `Saved “${preset.name}” on this device.`
      : `“${preset.name}” is available for this session only; browser storage is unavailable.`;
  } catch (error) {
    $('editorPresetMessage').textContent = error.message;
  }
}

function deleteEditorPreset() {
  const id = $('editorPreset').value;
  const preset = presetStore.get(id);
  if (!preset || preset.builtIn) return;
  presetStore.remove(id);
  populateEditorPresets();
  $('editorPresetMessage').textContent = `Deleted “${preset.name}”.`;
}

function applyGeometry(operation) {
  const nextGeometry = applyGeometryOperation(geometry, operation);
  if (nextGeometry.rotation === geometry.rotation && nextGeometry.mirrored === geometry.mirrored) return;
  geometry = nextGeometry;
  const next = {...getSettings(), geometry:{...geometry}};
  history.push(next);
  updateGeometryLabel();
  scheduleRender();
  scheduleSessionSave();
  updateHistoryButtons();
  $('editorPreset').value = '';
}

function populateComparisonSelectors() {
  for (const id of ['compareAlgorithmA', 'compareAlgorithmB']) {
    const select = $(id);
    select.replaceChildren();
    for (const algorithm of ALGORITHMS) select.add(new Option(algorithm.name, algorithm.id));
  }
  $('compareAlgorithmA').value = 'floyd-steinberg';
  $('compareAlgorithmB').value = 'atkinson';
  refreshPaletteSelector();
  $('comparePaletteA').value='game-boy-classic';
  $('comparePaletteB').value='pico-8';
}

async function renderAlgorithmComparison() {
  for(const job of activeComparisonJobs)job.cancel('Comparison superseded.');
  activeComparisonJobs=[];
  if (!source) {
    $('compareStatus').textContent = 'Import an image before comparing algorithms.';
    return;
  }
  const serial = ++comparisonSerial;
  const settings = getSettings();
  const algorithmA = $('compareAlgorithmA').value;
  const algorithmB = $('compareAlgorithmB').value;
  const paletteA=allPalettes().find(item=>item.id===$('comparePaletteA').value) ?? activePalette;
  const paletteB=allPalettes().find(item=>item.id===$('comparePaletteB').value) ?? activePalette;
  $('comparePaletteA').disabled=settings.mode!=='color';
  $('comparePaletteB').disabled=settings.mode!=='color';
  $('compareAlgorithmA').disabled=false;
  $('compareAlgorithmB').disabled=false;
  const transformed = transformedDimensions(source.width, source.height, geometry);
  const dimensions = outputDimensions(transformed.width, transformed.height, settings.width);
  const scale = Math.min(1, 512 / dimensions.width, 512 / dimensions.height);
  const previewWidth = Math.max(1, Math.round(dimensions.width * scale));
  const previewHeight = Math.max(1, Math.round(dimensions.height * scale));
  const logical = processingDimensions(previewWidth, previewHeight, Math.max(1, Math.round(settings.grain * scale)));
  $('compareStatus').textContent = 'Rendering algorithm previews…';
  $('runAlgorithmCompare').disabled = true;

  try {
    const sample = document.createElement('canvas');
    sample.width = logical.width;
    sample.height = logical.height;
    const sampleContext = sample.getContext('2d', {willReadFrequently:true});
    if (!sampleContext) throw new Error('Could not initialize comparison processing canvas.');
    drawSourceTransformed(sampleContext, source, geometry, logical.width, logical.height);
    const pixels = sampleContext.getImageData(0, 0, logical.width, logical.height);
    const adjustments = adjustmentsFromSettings(settings);
    const colorSettings = {
      method:settings.distanceMethod,
      alphaMode:settings.alphaMode,
      background:settings.background,
      strength:settings.strength,
      matrixSize:settings.matrixSize,
      orderedStrength:settings.orderedStrength,
      seed:settings.seed,
      randomness:settings.randomness,
      serpentine:settings.serpentine,
      adjustments:DEFAULT_ADJUSTMENTS
    };
    const renderCandidate=async(algorithm,palette)=>{
      const key=JSON.stringify([sourceRevision,logical.width,logical.height,geometry,adjustments,algorithm,settings.mode,settings.mode==='color'?palette.colors:null,colorSettings]);
      if(comparisonCache.has(key))return comparisonCache.get(key);
      const options=settings.mode==='color'
        ? {...colorSettings,algorithm,palette:palette.colors}
        : resolveAlgorithmSettings(settings);
      const job=runImageJob('process-editor-image',pixels,{
        mode:settings.mode,algorithm,options,adjustments,
        palette:settings.mode==='color'?palette.colors:undefined,
        paletteMethod:settings.distanceMethod,
        alphaMode:settings.alphaMode,
        background:settings.background
      },{priority:'medium'});
      activeComparisonJobs.push(job);
      const result=await job.promise;
      const measured={output:{width:result.width,height:result.height,data:new Uint8ClampedArray(result.buffer)},durationMs:result.processingMs};
      if(comparisonCache.size>=8)comparisonCache.delete(comparisonCache.keys().next().value);
      comparisonCache.set(key,measured);
      return measured;
    };
    const [outputA,outputB] = await Promise.all([
      renderCandidate(algorithmA,paletteA),renderCandidate(algorithmB,paletteB)
    ]);

    for (const [canvasId, output, algorithmId, palette,labelId,durationMs] of [
      ['compareCanvasA', outputA.output, algorithmA,paletteA, 'compareLabelA',outputA.durationMs],
      ['compareCanvasB', outputB.output, algorithmB,paletteB, 'compareLabelB',outputB.durationMs]
    ]) {
      const canvas = $(canvasId);
      canvas.width = previewWidth;
      canvas.height = previewHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not initialize a comparison preview canvas.');
      context.clearRect(0, 0, previewWidth, previewHeight);
      context.imageSmoothingEnabled = false;
      context.putImageData(new ImageData(output.data, output.width, output.height), 0, 0);
      if (output.width !== previewWidth || output.height !== previewHeight) {
        const small = document.createElement('canvas');
        small.width = output.width;
        small.height = output.height;
        const smallContext = small.getContext('2d');
        if (!smallContext) throw new Error('Could not scale a comparison preview.');
        smallContext.putImageData(new ImageData(output.data, output.width, output.height), 0, 0);
        context.drawImage(small, 0, 0, previewWidth, previewHeight);
      }
      $(labelId).textContent = settings.mode==='color'
        ? `${getAlgorithm(algorithmId).name} · ${palette.name} · ${palette.colors.length} colors · ${durationMs.toFixed(2)} ms`
        : `${getAlgorithm(algorithmId).name} · ${durationMs.toFixed(2)} ms`;
    }
    if (serial === comparisonSerial) {
      $('compareStatus').textContent = `Rendered ${previewWidth} × ${previewHeight} previews from the original image.`;
    }
  } catch (error) {
    if (serial === comparisonSerial) $('compareStatus').textContent = error instanceof Error ? error.message : 'Comparison rendering failed.';
  } finally {
    if (serial === comparisonSerial) {
      activeComparisonJobs=[];
      $('runAlgorithmCompare').disabled = false;
    }
  }
}

function applyComparisonResult(side) {
  const algorithm = $(side === 'a' ? 'compareAlgorithmA' : 'compareAlgorithmB').value;
  const paletteId=$(`comparePalette${side.toUpperCase()}`).value;
  const palette=allPalettes().find(item=>item.id===paletteId);
  const next = {...getSettings(), algorithm, preset:''};
  if(next.mode==='color'&&palette) {
    activePalette={...palette,colors:palette.colors.slice()};
    next.paletteId=palette.id;next.paletteName=palette.name;next.paletteColors=palette.colors.slice();
  }
  history.push(next);
  applySettings(next);
  $('preset').value = '';
  $('algorithmCompare').close();
}

function updateExportControls() {
  const format=$('exportFormat').value;
  const definition=EXPORT_FORMATS[format];
  $('qualityControl').hidden=!definition?.quality;
  $('jpegBackgroundControl').hidden=format!=='jpeg';
  $('qualityHelp').textContent=definition?.quality
    ? 'Adjusts lossy encoder quality, not resolution.'
    : 'PNG is lossless; the browser does not expose a PNG compression-quality slider.';
  const targetEnabled=$('targetSizeEnabled').checked&&!!definition?.quality;
  $('targetSize').disabled=!targetEnabled;
  $('targetSizeUnit').disabled=!targetEnabled;
  $('targetSizeHelp').textContent=definition?.quality
    ? 'Bounded search measures actual encoder output; the closest tested quality is used.'
    : 'Target-size quality search is unavailable for lossless PNG.';
  if(format==='avif'&&!exportCapabilities?.formats.avif)$('exportStatus').textContent='AVIF encoding is not supported by this browser.';
  if($('batchFormat'))$('batchQuality').disabled=!EXPORT_FORMATS[$('batchFormat').value]?.quality;
  $('formatNotice').textContent=format==='jpeg'
    ?'JPEG does not support transparency; transparent areas are composited onto the selected background.'
    :'Output dimensions preserve source aspect ratio.';
  if($('batchQuality'))$('batchQuality').closest('label').hidden=!EXPORT_FORMATS[$('batchFormat').value]?.quality;
}

function downloadBlob(blob, filename) {
  const url=resources.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;link.download=filename;
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>resources.revokeObjectURL(url),30_000);
}

async function exportCurrentImage() {
  if(!source||activeExportController)return;
  const controller=new AbortController();
  activeExportController=controller;
  const settings=getSettings();
  const format=$('exportFormat').value;
  const quality=Number($('quality').value);
  const totalStart=performance.now();
  let processMs=0;
  let resizeMs=0;
  $('download').disabled=true;
  $('cancelExport').hidden=false;
  $('exportProgress').hidden=false;
  $('exportProgress').removeAttribute('value');
  $('target').textContent='—';
  $('exportStatus').textContent='Preparing full-resolution export…';
  $('status').textContent='Processing full-resolution export…';
  try {
    if(format==='avif'&&!exportCapabilities?.formats.avif) {
      throw Object.assign(new Error('AVIF encoding is not supported by this browser. Choose PNG, JPEG, or WebP.'),{code:'UNSUPPORTED_ENCODER'});
    }
    const transformed=transformedDimensions(source.width,source.height,geometry);
    const dimensions=outputDimensions(transformed.width,transformed.height,settings.width);
    if(dimensions.width>32_767||dimensions.height>32_767||dimensions.width*dimensions.height>MAX_OUTPUT_PIXELS) {
      throw new Error('Export exceeds the 20-megapixel memory-safe output limit. Reduce the output width.');
    }
    const logical=processingDimensions(dimensions.width,dimensions.height,settings.grain);
    const sample=document.createElement('canvas');
    sample.width=logical.width;sample.height=logical.height;
    const sampleContext=sample.getContext('2d',{willReadFrequently:true});
    if(!sampleContext)throw new Error('Could not allocate the full-resolution processing buffer.');
    const resizeStarted=performance.now();
    drawSourceTransformed(sampleContext,source,geometry,logical.width,logical.height);
    const pixels=sampleContext.getImageData(0,0,logical.width,logical.height);
    resizeMs=performance.now()-resizeStarted;
    $('exportStatus').textContent='Processing original image at export resolution…';
    const processStart=performance.now();
    const job=runImageJob('process-editor-image',pixels,{
      mode:settings.mode,algorithm:settings.algorithm,adjustments:adjustmentsFromSettings(settings),
      options:settings.mode==='color'?colorProcessingSettings(settings,settings.paletteColors):resolveAlgorithmSettings(settings),
      palette:settings.mode==='color'?settings.paletteColors:undefined,
      paletteMethod:settings.distanceMethod,alphaMode:settings.alphaMode,background:settings.background
    },{priority:'medium',signal:controller.signal});
    activeExportController.cancelProcessing=job.cancel;
    const result=await job.promise;
    processMs=result.processingMs??(performance.now()-processStart);
    if(controller.signal.aborted)throw new DOMException('Export cancelled.','AbortError');

    const low=document.createElement('canvas');
    low.width=logical.width;low.height=logical.height;
    const lowContext=low.getContext('2d');
    if(!lowContext)throw new Error('Could not initialize the export processing canvas.');
    lowContext.putImageData(new ImageData(new Uint8ClampedArray(result.buffer),logical.width,logical.height),0,0);
    const output=document.createElement('canvas');
    output.width=dimensions.width;output.height=dimensions.height;
    const outputContext=output.getContext('2d');
    if(!outputContext)throw new Error('Could not allocate the output canvas.');
    outputContext.imageSmoothingEnabled=false;
    outputContext.drawImage(low,0,0,dimensions.width,dimensions.height);

    $('exportStatus').textContent='Encoding output…';
    const encodingStart=performance.now();
    let blob,selectedQuality=quality,targetResult=null;
    const encodeAtQuality=value=>encodeCanvas(output,format,value,{background:$('jpegBackground').value});
    if($('targetSizeEnabled').checked&&EXPORT_FORMATS[format].quality) {
      const targetBytes=parseTargetBytes($('targetSize').value,$('targetSizeUnit').value);
      targetResult=await findClosestTargetSize(encodeAtQuality,{targetBytes,minQuality:.1,maxQuality:1,attempts:8,signal:controller.signal});
      blob=targetResult.blob;selectedQuality=targetResult.quality;
      $('target').textContent=targetResult.compliant
        ? `Within target at ${Math.round(selectedQuality*100)}%`
        : `Closest result exceeds target (${formatBytes(blob.size)})`;
      $('target').className=targetResult.compliant?'target-good':'';
    } else {
      if($('targetSizeEnabled').checked) {
        $('target').textContent='PNG is lossless; target quality search unavailable.';
      }
      blob=await encodeAtQuality(quality);
    }
    if(controller.signal.aborted)throw new DOMException('Export cancelled.','AbortError');
    const baseline=document.createElement('canvas');
    baseline.width=dimensions.width;baseline.height=dimensions.height;
    const baselineContext=baseline.getContext('2d');
    if(!baselineContext)throw new Error('Could not allocate the comparison-size canvas.');
    drawSourceTransformed(baselineContext,source,geometry,dimensions.width,dimensions.height);
    const baselineBlob=await encodeCanvas(baseline,format,selectedQuality,{background:$('jpegBackground').value});
    const reduction=baselineBlob.size
      ?((baselineBlob.size-blob.size)/baselineBlob.size)*100
      :null;
    encodingDuration=performance.now()-encodingStart;
    latestBlob=blob;
    $('filesize').textContent=formatBytes(blob.size);
    $('encodedFileSize').textContent=formatBytes(blob.size);
    $('exportReduction').textContent=reduction===null?'—':`${reduction.toFixed(1)}% ${reduction>=0?'smaller':'larger'}`;
    $('processingTime').textContent=`${processMs.toFixed(2)} ms`;
    $('encodingTime').textContent=`${encodingDuration.toFixed(2)} ms`;
    $('resizeTime').textContent=`${resizeMs.toFixed(2)} ms`;
    $('decodeTime').textContent=`${decodeDuration.toFixed(2)} ms`;
    $('exportDimensions').textContent=`${dimensions.width} × ${dimensions.height}`;
    $('exportStatus').textContent=`Exported ${formatBytes(blob.size)} ${format.toUpperCase()} in ${(performance.now()-totalStart).toFixed(2)} ms`;
    $('exportTotalTime').textContent=`${(performance.now()-totalStart).toFixed(2)} ms`;
    $('target').textContent=targetResult
      ? `${targetResult.compliant?'Within target':'Closest measured'} · ${formatBytes(blob.size)}`
      : $('target').textContent==='—'?'—':$('target').textContent;
    downloadBlob(blob,safeOutputFilename(`${sourceName.replace(/\.[^.]+$/,'')}-dithered`,format));
    $('status').textContent=`Export complete · ${formatBytes(blob.size)} ${format.toUpperCase()}`;
    $('statusDot').className='ready';
  } catch(error) {
    const cancelled=error?.name==='AbortError'||controller.signal.aborted;
    $('exportStatus').textContent=cancelled?'Export cancelled':error.message||'Export failed.';
    $('status').textContent=cancelled?'Export cancelled':error.message||'Export failed.';
    $('statusDot').className=cancelled?'':'error';
  } finally {
    if(activeExportController===controller)activeExportController=null;
    $('download').disabled=!source;
    $('cancelExport').hidden=true;
    $('exportProgress').hidden=true;
  }
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

function centerCanvasScroll() {
  const wrap = $('canvasWrap');
  wrap.scrollLeft = Math.max(0, (wrap.scrollWidth - wrap.clientWidth) / 2);
  wrap.scrollTop = Math.max(0, (wrap.scrollHeight - wrap.clientHeight) / 2);
}

function updateCanvasZoom() {
  if (!source) return;
  const wrap = $('canvasWrap');
  const stage = $('canvasStage');
  const view = stage.dataset.view || 'processed';
  const sideBySide = view === 'side-by-side';
  const gap = sideBySide ? 12 : 0;
  const canvas = $('outputCanvas');
  if (fitZoom) {
    const availableHeight = Math.max(100, wrap.clientHeight - 80);
    const availableWidth = sideBySide
      ? Math.max(100, (wrap.clientWidth - 64 - gap) / 2)
      : Math.max(100, wrap.clientWidth - 64);
    zoom = Math.min(1, availableWidth / canvas.width, availableHeight / canvas.height);
  }
  zoom = Math.min(8, Math.max(0.1, zoom));
  const width = Math.max(1, Math.round(canvas.width * zoom));
  const height = Math.max(1, Math.round(canvas.height * zoom));
  stage.style.width = `${sideBySide ? width * 2 + gap : width}px`;
  stage.style.height = `${height}px`;
  const original = $('originalCanvas');
  for (const element of [original, canvas]) {
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
    element.style.top = '0';
  }
  original.style.left = '0';
  canvas.style.left = sideBySide ? `${width + gap}px` : '0';
  $('zoomValue').textContent = fitZoom ? 'Fit' : `${Math.round(zoom * 100)}%`;
  for (const id of ['zoomOut', 'zoomIn', 'zoomActual', 'zoomValue']) {
    if ($(id)) $(id).disabled = false;
  }
}

function resetZoomAndPan() {
  fitZoom = true;
  updateCanvasZoom();
  requestAnimationFrame(centerCanvasScroll);
}

function setZoom(nextZoom) {
  fitZoom = false;
  zoom = Math.min(8, Math.max(0.1, nextZoom));
  updateCanvasZoom();
}

function setView(mode) {
  const stage = $('canvasStage');
  stage.dataset.view = mode;
  stage.classList.remove('holding-original');
  $('holdOriginal').setAttribute('aria-pressed', 'false');
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
  updateCanvasZoom();
  scheduleSessionSave();
}

function updateComparison() {
  const value = Number($('compare').value);
  const isComparing = $('canvasStage').dataset.view === 'compare';
  const slider = $('compare');
  if (slider) slider.value = String(value);
  $('outputCanvas').style.clipPath = isComparing ? `inset(0 ${100-value}% 0 0)` : 'inset(0 0 0 0)';
  $('compareLine').style.left = `${value}%`;
  $('compareLine').setAttribute('aria-valuenow', String(Math.round(value)));
  $('compareValue').textContent = `${value}%`;
}

function colorProcessingSettings(settings, palette=activePalette.colors) {
  return {
    palette,
    method:settings.distanceMethod,
    algorithm:settings.algorithm,
    alphaMode:settings.alphaMode,
    background:settings.background,
    strength:settings.strength,
    matrixSize:settings.matrixSize,
    orderedStrength:settings.orderedStrength,
    seed:settings.seed,
    randomness:settings.randomness,
    serpentine:settings.serpentine,
    adjustments:DEFAULT_ADJUSTMENTS
  };
}

let processingJobSequence = 0;
function runImageJob(type, image, payload, {priority='high',signal}={}) {
  const id=`${type.replace(/[^a-z]/g,'')}-${++processingJobSequence}`;
  const buffer=image.data.slice().buffer;
  let task;
  const scheduled=jobScheduler.submit({
    id,priority,signal,
    run:({signal:jobSignal})=>new Promise((resolve,reject)=>{
      task=processor.submit(type,{...payload,width:image.width,height:image.height,buffer},{id});
      const cancel=()=>{task?.cancel(jobSignal.reason);reject(new DOMException('Processing cancelled.','AbortError'));};
      if(jobSignal.aborted){cancel();return;}
      jobSignal.addEventListener('abort',cancel,{once:true});
      task.promise.then(value=>{
        jobSignal.removeEventListener('abort',cancel);
        resolve(value);
      },error=>{
        jobSignal.removeEventListener('abort',cancel);
        reject(error);
      });
    })
  });
  const promise=scheduled.promise.then(result=>{
    if(result.state==='completed')return result.value;
    if(result.state==='failed')throw result.error;
    throw new DOMException('Processing cancelled.','AbortError');
  });
  return {promise,cancel:scheduled.cancel};
}

async function render() {
  const serial = ++renderSerial;
  activePreviewJob?.cancel('Superseded by a newer preview.');
  activePreviewJob=null;
  latestBlob = null;
  $('download').disabled = !source;
  if (!source) return;
  const settings = getSettings();
  $('processingTime').textContent = '—';
  $('encodingTime').textContent = '—';
  $('metricAlgorithm').textContent = getAlgorithm(settings.algorithm).name;
  $('metricPreset').textContent = presetName(settings.preset);
  $('metricMode').textContent = settings.mode==='color' ? `Color · ${activePalette.name}` : 'Monochrome';
  $('metricColorMethod').textContent = settings.mode==='color' ? `${settings.distanceMethod} · ${activePalette.colors.length} colors` : '—';
  $('metricExtraction').textContent = extractionDuration ? `${extractionDuration.toFixed(2)} ms` : '—';
  $('status').textContent = 'Rendering image…';
  $('statusDot').className = 'processing';
  try {
    const transformed = transformedDimensions(source.width, source.height, geometry);
    const dimensions = outputDimensions(transformed.width, transformed.height, settings.width);
    if (dimensions.width > 32_767 || dimensions.height > 32_767 || dimensions.width * dimensions.height > MAX_OUTPUT_PIXELS) {
      throw new Error('Preview output exceeds the 20-megapixel memory-safe limit. Reduce the output width.');
    }
    const previewScale=Math.min(1,1024/dimensions.width,1024/dimensions.height);
    const previewDimensions={
      width:Math.max(1,Math.round(dimensions.width*previewScale)),
      height:Math.max(1,Math.round(dimensions.height*previewScale))
    };
    const logical = processingDimensions(previewDimensions.width, previewDimensions.height,
      Math.max(1,Math.round(settings.grain*previewScale)));
    const low = document.createElement('canvas');
    low.width = logical.width;
    low.height = logical.height;
    const lowContext = low.getContext('2d', {willReadFrequently:true});
    if (!lowContext) throw new Error('Could not initialize the processing canvas.');
    drawSourceTransformed(lowContext, source, geometry, logical.width, logical.height);
    const pixels = lowContext.getImageData(0, 0, logical.width, logical.height);
    const processStart = performance.now();
    const job=runImageJob('process-editor-image',pixels,{
      mode:settings.mode,algorithm:settings.algorithm,adjustments:adjustmentsFromSettings(settings),
      options:settings.mode==='color'?colorProcessingSettings(settings,settings.paletteColors):resolveAlgorithmSettings(settings),
      palette:settings.mode==='color'?settings.paletteColors:undefined,
      paletteMethod:settings.distanceMethod,alphaMode:settings.alphaMode,background:settings.background
    },{priority:'high'});
    activePreviewJob=job;
    const result=await job.promise;
    const dithered={...result,data:new Uint8ClampedArray(result.buffer)};
    processingDuration = result.processingMs ?? (performance.now() - processStart);
    lowContext.putImageData(new ImageData(dithered.data, logical.width, logical.height), 0, 0);

    const originalCanvas = $('originalCanvas');
    const outputCanvas = $('outputCanvas');
    originalCanvas.width = outputCanvas.width = previewDimensions.width;
    originalCanvas.height = outputCanvas.height = previewDimensions.height;
    const originalContext = originalCanvas.getContext('2d');
    const outputContext = outputCanvas.getContext('2d');
    if (!originalContext || !outputContext) throw new Error('Could not initialize the preview canvas.');
    originalContext.clearRect(0, 0, previewDimensions.width, previewDimensions.height);
    drawSourceTransformed(originalContext, source, geometry, previewDimensions.width, previewDimensions.height);
    outputContext.clearRect(0, 0, previewDimensions.width, previewDimensions.height);
    outputContext.imageSmoothingEnabled = false;
    outputContext.drawImage(low, 0, 0, previewDimensions.width, previewDimensions.height);

    const encodingStart = performance.now();
    let blob=null;
    try {blob=await encodeCanvas(outputCanvas,$('exportFormat').value,Number($('quality').value),{background:$('jpegBackground').value});}
    catch {blob=null;}
    encodingDuration = performance.now() - encodingStart;
    if (serial !== renderSerial) return;
    latestBlob = blob;
    $('placeholder').hidden = true;
    $('canvasStage').hidden = false;
    $('dimensions').textContent = previewScale<1
      ? `${dimensions.width} × ${dimensions.height} export · ${previewDimensions.width} × ${previewDimensions.height} preview`
      : `${dimensions.width} × ${dimensions.height}`;
    $('exportDimensions').textContent=`${dimensions.width} × ${dimensions.height}`;
    $('inputMetrics').textContent=`${source.width} × ${source.height} · ${formatBytes(sourceFileSize)}`;
    $('decodeTime').textContent=`${decodeDuration.toFixed(2)} ms`;
    $('imageInfo').textContent = `${source.width} × ${source.height} px · ${formatBytes(sourceFileSize)}`;
    $('filesize').textContent = blob?formatBytes(blob.size):'Unavailable';
    $('processingTime').textContent = `${processingDuration.toFixed(2)} ms`;
    $('encodingTime').textContent = `${encodingDuration.toFixed(2)} ms`;
    $('metricAlgorithm').textContent = getAlgorithm(settings.algorithm).name;
    $('metricPreset').textContent = presetName(settings.preset);
    $('target').textContent = $('targetSizeEnabled').checked?'Not measured':'—';
    $('target').className = '';
    $('download').disabled = false;
    $('zoomOut').disabled = false;
    $('zoomValue').disabled = false;
    $('zoomIn').disabled = false;
    $('status').textContent = `Preview ready · ${previewDimensions.width} × ${previewDimensions.height}${previewScale<1?' (reduced resolution)':''}`;
    $('executionMode').textContent=executionMode;
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
  activePreviewJob?.cancel('Superseded by a newer preview.');
  activePreviewJob=null;
  latestBlob = null;
  $('download').disabled = true;
  $('processingTime').textContent = '—';
  $('encodingTime').textContent = '—';
  $('encodedFileSize').textContent='—';
  $('exportReduction').textContent='—';
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(render, 130);
  scheduleSessionSave();
}

function resetSettings() {
  const current = getSettings();
  if (sameSettings(current, defaults)) return;
  geometry = {...DEFAULT_GEOMETRY};
  const next = {...defaults, geometry:{...DEFAULT_GEOMETRY}};
  history.push(next);
  applySettings(next);
}

for (const id of controls) {
  const el = $(id);
  if (!el) continue;
  if (id === 'preset') {
    el.addEventListener('change', () => {
      if (el.value) applyPreset(el.value);
    });
    continue;
  }
  if(id==='paletteId') {
    el.addEventListener('change',()=>{
      const palette=allPalettes().find(item=>item.id===el.value);
      if($('preset').value)$('preset').value='';
      if(palette)setActivePalette(palette);
    });
    continue;
  }
  el.addEventListener('input', () => {
    if (id !== 'quality' && $('preset').value) $('preset').value = '';
    if ($('editorPreset')) $('editorPreset').value = '';
    updateLabels();
    scheduleRender();
    commitSettings({coalesceKey: id, coalesceMs: 600});
  });
  el.addEventListener('change', () => commitSettings({coalesceKey: id, coalesceMs: 600}));
}
$('reset').addEventListener('click', resetSettings);
$('resetProperties').addEventListener('click', resetSettings);
$('resetAdjustments').addEventListener('click', () => {
  applyingSettings = true;
  try {
    $('brightness').value = 0;
    $('adjustContrast').value = 0;
    $('saturation').value = 0;
    $('exposure').value = 0;
    $('gamma').value = 1;
    $('hue').value = 0;
    $('temperature').value = 0;
    $('tint').value = 0;
    $('grayscale').checked = false;
    $('invert').checked = false;
  } finally {
    applyingSettings = false;
  }
  updateLabels();
  commitSettings();
});
for (const operation of ['rotate-ccw', 'rotate-cw', 'rotate-180', 'flip-h', 'flip-v', 'reset']) {
  const button = document.querySelector(`[data-geometry="${operation}"]`);
  if (!button) continue;
  button.addEventListener('click', () => applyGeometry(operation));
}
$('undo').addEventListener('click', () => {
  const previous = history.undo();
  if (!previous) return;
  applySettings(previous);
});
$('redo').addEventListener('click', () => {
  const next = history.redo();
  if (!next) return;
  applySettings(next);
});

async function chooseFile(file) {
  if (!file) return;
  ++renderSerial;
  activePreviewJob?.cancel('Superseded by a new source image.');
  activePreviewJob=null;
  clearTimeout(debounceTimer);
  latestBlob = null;
  $('download').disabled = true;
  $('status').textContent = 'Decoding image…';
  $('statusDot').className = 'processing';
  const token = renderSerial;
  try {
    const decodeStarted=performance.now();
    const image = await loadImage(file);
    decodeDuration=performance.now()-decodeStarted;
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
      sourceRevision++;
      comparisonCache.clear();
      extractionDuration = 0;
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
  exportCurrentImage();
});
$('cancelExport').addEventListener('click',()=>{
  if(activeExportController){
    activeExportController.abort('Cancelled by user.');
    activeExportController.cancelProcessing?.('Cancelled by user.');
  }
});
$('exportFormat').addEventListener('change',()=>{updateExportControls();scheduleRender();});
$('jpegBackground').addEventListener('input',scheduleRender);
$('targetSizeEnabled').addEventListener('change',updateExportControls);

async function initializeExportCapabilities() {
  try{
    exportCapabilities=await detectExportCapabilities();
    const avif=$('exportFormat').querySelector('option[value="avif"]');
    avif.disabled=!exportCapabilities.formats.avif;
    avif.textContent=exportCapabilities.formats.avif?'AVIF':'AVIF · Unsupported by this browser';
    for(const format of ['png','jpeg','webp']) {
      const option=$('exportFormat').querySelector(`option[value="${format}"]`);
      option.disabled=!exportCapabilities.formats[format];
    }
    const batchAvif=$('batchFormat').querySelector('option[value="avif"]');
    batchAvif.disabled=!exportCapabilities.formats.avif;
    batchAvif.textContent=exportCapabilities.formats.avif?'AVIF':'AVIF · Unsupported';
    if(!exportCapabilities.formats[$('exportFormat').value])$('exportFormat').value='png';
    updateExportControls();
  }catch(error){
    $('exportStatus').textContent=`Export capability detection failed: ${error.message}`;
  }
  try{
    const capabilityJob=processor.submit('get-capabilities',{});
    const capabilities=await capabilityJob.promise;
    if(capabilities.moduleWorkers)executionMode='Web Worker';
    else executionMode='Main-thread fallback';
    $('executionMode').textContent=executionMode;
  }catch{
    executionMode=processor.available?'Worker unavailable':'Main-thread fallback';
    $('executionMode').textContent=executionMode;
  }
}

function batchPresetSettings() {
  const settings=getSettings();
  const id=$('batchPreset').value;
  if(!id)return settings;
  const monochrome=PRESETS.find(preset=>preset.id===id);
  if(monochrome)return {...settings,...monochrome.settings,preset:id};
  const color=getColorPreset(id);
  if(color){
    Object.assign(settings,color.settings,{preset:id});
    const palette=color.settings.paletteId==='adaptive'?null:getPalette(color.settings.paletteId);
    if(palette)Object.assign(settings,{paletteId:palette.id,paletteName:palette.name,paletteColors:palette.colors.slice()});
  }
  return settings;
}

function renderBatchQueue(items,summary) {
  const savings=summary.savedBytes>=0
    ?`saved ${formatBytes(summary.savedBytes)}${summary.savedPercent===null?'':` (${summary.savedPercent.toFixed(1)}%)`}`
    :`output +${formatBytes(-summary.savedBytes)} (${Math.abs(summary.savedPercent??0).toFixed(1)}% larger)`;
  $('batchSummary').textContent=items.length
    ? `${summary.total} total · ${summary.queued} queued · ${summary.running} running · ${summary.completed} completed · ${summary.failed} failed · ${summary.cancelled} cancelled · in ${formatBytes(summary.inputBytes)} · out ${formatBytes(summary.outputBytes)} · ${savings}`
    : 'No images queued.';
  if(summary.total>0&&summary.queued===0&&summary.running===0){
    $('batchStatus').textContent=`Batch finished · ${summary.completed} completed · ${summary.failed} failed · ${summary.cancelled} cancelled.`;
  }
  $('batchDownloadZip').disabled=summary.completed===0;
  const list=$('batchList');
  list.replaceChildren();
  for(const item of items){
    const row=document.createElement('article');row.className='batch-item';
    const image=document.createElement('img');image.alt='';image.src=batchObjectUrls.get(item.id)??'';
    const info=document.createElement('div');info.className='batch-item-info';
    const name=document.createElement('strong');name.textContent=item.name;
    const dimensions=document.createElement('small');dimensions.textContent=
      `${item.dimensions?`${item.dimensions.width} × ${item.dimensions.height} px · `:''}${formatBytes(item.size)} · ${item.settings.format.toUpperCase()} · ${item.status}${item.output?` · ${formatBytes(item.output.blob.size)} · ${item.output.durationMs.toFixed(2)} ms`:''}`;
    if(item.error)dimensions.title=item.error.message;
    info.append(name,dimensions);
    const actions=document.createElement('div');actions.className='batch-item-actions';
    const state=document.createElement('strong');state.className='batch-state';state.dataset.state=item.status;
    state.textContent=item.status==='running'
      ?`${item.progress?.stage==='encoding'?'Encoding':'Processing'}…`
      :item.status;
    actions.append(state);
    if(item.output){
      const download=document.createElement('button');download.type='button';download.className='text-button';
      download.textContent='Download';download.addEventListener('click',()=>downloadBlob(item.output.blob,item.outputName));actions.append(download);
    }else if(item.status==='failed'){
      const retry=document.createElement('button');retry.type='button';retry.className='text-button';
      retry.textContent='Retry';retry.addEventListener('click',()=>batchQueue.retry(item.id));actions.append(retry);
    }else if(item.status==='queued'||item.status==='running'){
      const cancel=document.createElement('button');cancel.type='button';cancel.className='text-button';
      cancel.textContent='Cancel item';cancel.setAttribute('aria-label',`Cancel ${item.name}`);
      cancel.addEventListener('click',()=>batchQueue.cancel(item.id));actions.append(cancel);
    }
    row.append(image,info,actions);list.append(row);
  }
}

batchQueue=new BatchQueue({
  concurrency:2,maxItems:100,
  processItem:async(item,{signal,onProgress})=>{
    const started=performance.now();
    let image;
    try {
      image=await loadImage(item.file);
      if(signal.aborted)throw new DOMException('Batch item cancelled.','AbortError');
      if(image.width*image.height>50_000_000)throw new Error('Image exceeds the 50-megapixel input limit.');
      let settings=item.settings;
      if(settings.paletteId==='adaptive'){
        const sourceCanvas=document.createElement('canvas');sourceCanvas.width=Math.min(image.width,512);
        sourceCanvas.height=Math.max(1,Math.round(image.height*sourceCanvas.width/image.width));
        const sourceContext=sourceCanvas.getContext('2d',{willReadFrequently:true});
        if(!sourceContext)throw new Error('Could not allocate palette extraction canvas.');
        sourceContext.drawImage(image,0,0,sourceCanvas.width,sourceCanvas.height);
        const extracted=await runImageJob('extract-palette',sourceContext.getImageData(0,0,sourceCanvas.width,sourceCanvas.height),
          {options:{method:'median-cut',colorCount:8}},{priority:'low',signal}).promise;
        if(extracted.colors.length<2)throw new Error('Image has fewer than two visible colors for adaptive palette extraction.');
        settings={...settings,paletteColors:extracted.colors};
      }
      const dimensions=outputDimensions(image.width,image.height,settings.width);
      if(dimensions.width*dimensions.height>MAX_OUTPUT_PIXELS)throw new Error('Batch output exceeds the 20-megapixel memory-safe limit.');
      const logical=processingDimensions(dimensions.width,dimensions.height,settings.grain);
      const sample=document.createElement('canvas');sample.width=logical.width;sample.height=logical.height;
      const sampleContext=sample.getContext('2d',{willReadFrequently:true});
      if(!sampleContext)throw new Error('Could not allocate batch processing canvas.');
      sampleContext.drawImage(image,0,0,logical.width,logical.height);
      const pixels=sampleContext.getImageData(0,0,logical.width,logical.height);
      onProgress({stage:'processing'});
      const result=await runImageJob('process-image',pixels,{
        mode:settings.mode,algorithm:settings.algorithm,
        options:settings.mode==='color'?colorProcessingSettings(settings,settings.paletteColors):resolveAlgorithmSettings(settings)
      },{priority:'low',signal}).promise;
      const low=document.createElement('canvas');low.width=logical.width;low.height=logical.height;
      const lowContext=low.getContext('2d');if(!lowContext)throw new Error('Could not initialize batch output.');
      lowContext.putImageData(new ImageData(new Uint8ClampedArray(result.buffer),logical.width,logical.height),0,0);
      const canvas=document.createElement('canvas');canvas.width=dimensions.width;canvas.height=dimensions.height;
      const outputContext=canvas.getContext('2d');if(!outputContext)throw new Error('Could not allocate batch export canvas.');
      outputContext.imageSmoothingEnabled=false;outputContext.drawImage(low,0,0,dimensions.width,dimensions.height);
      onProgress({stage:'encoding'});
      const encodingStarted=performance.now();
      const blob=await encodeCanvas(canvas,settings.format,settings.quality,{background:$('jpegBackground').value});
      if(signal.aborted)throw new DOMException('Batch item cancelled.','AbortError');
      if(batchRetainedOutputBytes+blob.size>256*1024*1024)throw new Error('Batch output memory limit reached (256 MiB). Download or clear completed results before continuing.');
      batchRetainedOutputBytes+=blob.size;
      batchOutputReservations.set(item.id,blob.size);
      return {blob,width:dimensions.width,height:dimensions.height,
        durationMs:performance.now()-started,encodingMs:performance.now()-encodingStarted};
    }finally{image?.close?.();}
  },
  onChange:(items,summary)=>{
    for(const item of items){
      if((item.status==='failed'||item.status==='cancelled')&&!item.output&&batchOutputReservations.has(item.id)){
        batchRetainedOutputBytes-=batchOutputReservations.get(item.id);
        batchOutputReservations.delete(item.id);
      }
    }
    renderBatchQueue(items,summary);
  }
});
batchQueue.pause();

for(const preset of PRESETS)$('batchPreset').add(new Option(preset.name,preset.id));
const batchColorGroup=document.createElement('optgroup');batchColorGroup.label='Color presets';
for(const preset of COLOR_PRESETS)batchColorGroup.append(new Option(preset.name,preset.id));
$('batchPreset').append(batchColorGroup);

function addBatchFiles(files) {
  const images=[...files].filter(file=>file.type.startsWith('image/')||/\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name));
  if(!images.length){$('batchStatus').textContent='Choose one or more browser-supported image files.';return;}
  try{
    const settings={...batchPresetSettings(),format:$('batchFormat').value,quality:Number($('batchQuality').value)};
    const items=batchQueue.add(images,settings);
    for(const item of items){
      const url=resources.createObjectURL(item.file);batchObjectUrls.set(item.id,url);
      loadImage(item.file).then(bitmap=>{
        item.dimensions={width:bitmap.width,height:bitmap.height};bitmap.close?.();
        renderBatchQueue(batchQueue.items,batchQueue.summary());
      }).catch(error=>{item.error=error;renderBatchQueue(batchQueue.items,batchQueue.summary());});
    }
    $('batchStatus').textContent=`Queued ${items.length} image${items.length===1?'':'s'} for local processing.`;
  }catch(error){$('batchStatus').textContent=error.message;}
}

$('openBatch').addEventListener('click',()=>$('batchDialog').showModal());
$('batchClose').addEventListener('click',()=>$('batchDialog').close());
$('batchFiles').addEventListener('change',event=>{addBatchFiles(event.target.files??[]);event.target.value='';});
$('batchFormat').addEventListener('change',updateExportControls);
$('batchStart').addEventListener('click',()=>{batchQueue.resume();$('batchStatus').textContent='Queued batch work is running.';});
$('batchPause').addEventListener('click',()=>{batchQueue.pause();$('batchStatus').textContent='Scheduling paused; active items will finish.';});
$('batchResume').addEventListener('click',()=>{batchQueue.resume();$('batchStatus').textContent='Batch scheduling resumed.';});
$('batchCancel').addEventListener('click',()=>{batchQueue.cancel();$('batchStatus').textContent='Batch cancelled; active worker jobs are being stopped.';});
$('batchDownloadZip').addEventListener('click',async()=>{
  const results=batchQueue.items.filter(item=>item.status==='completed'&&item.output);
  if(!results.length)return;
  $('batchDownloadZip').disabled=true;$('batchStatus').textContent='Creating ZIP archive…';
  try{
    const entries=results.map(item=>({name:item.outputName,data:item.output.blob}));
    const blob=await createStoredZip(entries,{maxBytes:256*1024*1024,onProgress:progress=>{
      $('batchStatus').textContent=`Creating ZIP archive · ${progress.completed}/${progress.total}`;
    }});
    downloadBlob(blob,'sidali-ditherlab-batch.zip');
    $('batchStatus').textContent=`ZIP ready · ${results.length} completed image${results.length===1?'':'s'} · ${formatBytes(blob.size)}.`;
  }catch(error){$('batchStatus').textContent=`ZIP export failed: ${error.message}`;}
  finally{$('batchDownloadZip').disabled=batchQueue.summary().completed===0;}
});
$('batchDialog').addEventListener('dragover',event=>event.preventDefault());
$('batchDialog').addEventListener('drop',event=>{
  event.preventDefault();
  if(event.dataTransfer?.files?.length)addBatchFiles(event.dataTransfer.files);
});
window.addEventListener('pagehide',()=>{
  resources.clear();
  source?.close?.();
  processor.cancelAll('Page is closing.');
  jobScheduler.close();
  sessionStore.flush();
  sessionStore.dispose();
});

for (const button of document.querySelectorAll('.view-tab')) {
  button.addEventListener('click', () => setView(button.dataset.view));
}
$('compare').addEventListener('input', updateComparison);
$('algorithmCompareOpen').addEventListener('click', () => {
  $('algorithmCompare').showModal();
  renderAlgorithmComparison();
});
$('algorithmCompareClose').addEventListener('click', () => $('algorithmCompare').close());
$('runAlgorithmCompare').addEventListener('click', renderAlgorithmComparison);
for (const button of document.querySelectorAll('.apply-compare')) {
  button.addEventListener('click', () => applyComparisonResult(button.dataset.apply));
}
$('compareAlgorithmA').addEventListener('change', renderAlgorithmComparison);
$('compareAlgorithmB').addEventListener('change', renderAlgorithmComparison);
$('paletteCategory').addEventListener('change',refreshPaletteSelector);
$('paletteSearch').addEventListener('input',refreshPaletteSelector);
$('newPalette').addEventListener('click',()=>{
  try {
    const palette=createCustomPalette('My Palette',activePalette.colors.slice(0,Math.max(2,Math.min(activePalette.colors.length,8))));
    setActivePalette(palette);
    $('customPaletteName').value=palette.name;
    showPaletteMessage('New unsaved palette created. Edit colors, then save locally.');
  } catch(error) {showPaletteMessage(error.message);}
});
$('duplicatePalette').addEventListener('click',()=>{
  try {
    const palette=createCustomPalette(`${activePalette.name} Copy`,activePalette.colors);
    setActivePalette(palette);
    $('customPaletteName').value=palette.name;
    showPaletteMessage('Palette duplicated. Save locally to keep it after reload.');
  } catch(error) {showPaletteMessage(error.message);}
});
$('addPaletteColor').addEventListener('click',()=>{
  if(activePalette.colors.length>=256){showPaletteMessage('A palette can contain at most 256 colors.');return;}
  const candidates=['#B6F36B','#FF6B6B','#4ECDC4','#FFE66D','#7B61FF'];
  const color=candidates.find(item=>!activePalette.colors.includes(item)) ?? rgbToHex([Math.floor(Math.random()*256),Math.floor(Math.random()*256),Math.floor(Math.random()*256)]);
  if(activePalette.colors.includes(color)){showPaletteMessage('Choose a unique color before adding another.');return;}
  $('preset').value='';
  activePalette={...activePalette,colors:[...activePalette.colors,color]};
  renderPaletteEditor();commitSettings();scheduleRender();
});
$('customPaletteName').addEventListener('change',()=>{
  try {
    $('preset').value='';
    activePalette=updateCustomPalette({...activePalette,builtIn:false},{name:$('customPaletteName').value});
    renderPaletteEditor();commitSettings();scheduleRender();showPaletteMessage('Palette name updated. Save locally to persist it.');
  }catch(error){showPaletteMessage(error.message);$('customPaletteName').value=activePalette.name;}
});
$('savePalette').addEventListener('click',saveActivePalette);
$('deletePalette').addEventListener('click',()=>{
  const index=customPalettes.findIndex(item=>item.id===activePalette.id);
  if(index<0)return;
  const previous=customPalettes.slice();
  customPalettes.splice(index,1);
  if(!persistCustomPalettes()){customPalettes=previous;return;}
  setActivePalette(getPalette('black-white'));
  showPaletteMessage('Saved palette deleted.');
});
$('resetPalette').addEventListener('click',()=>{
  const builtIn=BUILT_IN_PALETTES.find(item=>item.id===activePalette.id);
  const saved=customPalettes.find(item=>item.id===activePalette.id);
  if(builtIn)setActivePalette(builtIn);
  else if(saved)setActivePalette(saved);
  else showPaletteMessage('This unsaved palette has no saved version to restore.');
});
$('importPalette').addEventListener('click',()=>$('paletteFile').click());
$('paletteFile').addEventListener('change',async event=>{
  const file=event.target.files?.[0];event.target.value='';
  if(!file)return;
  try {
    if(file.size>64*1024)throw new RangeError('Palette JSON must be no larger than 64 KiB.');
    const imported=parsePaletteJSON(await file.text());
    const palette=createCustomPalette(imported.name,imported.colors);
    setActivePalette(palette);
    $('customPaletteName').value=palette.name;
    showPaletteMessage('Palette imported. Save locally to keep it after reload.');
  }catch(error){showPaletteMessage(error.message);}
});
$('exportPalette').addEventListener('click',()=>{
  try {
    const blob=new Blob([serializePaletteJSON({name:activePalette.name,colors:activePalette.colors})],{type:'application/json'});
    const url=URL.createObjectURL(blob);const link=document.createElement('a');
    link.href=url;link.download=`${activePalette.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}.json`;
    document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
    showPaletteMessage('Palette JSON exported.');
  }catch(error){showPaletteMessage(error.message);}
});
$('extractPalette').addEventListener('click',async()=>{
  try {
    if(!source)throw new Error('Import an image before extracting a palette.');
    const job=runImageJob('extract-palette',readSourcePixels(512),{
      options:{method:$('extractionMethod').value,colorCount:Number($('colorCount').value),seed:Number($('seed').value)}
    },{priority:'medium'});
    activeExtractionJob=job;
    $('extractPalette').disabled=true;
    $('cancelExtraction').hidden=false;
    const result=await job.promise;
    extractionDuration=result.durationMs;
    $('extractionTime').textContent=`${result.durationMs.toFixed(2)} ms · ${result.colors.length} colors`;
    if(result.colors.length<2)throw new Error('The image has fewer than two distinct visible colors; it cannot form a dither palette.');
    const palette=createCustomPalette(`Extracted ${result.colors.length}-Color`,result.colors);
    setActivePalette(palette);
    $('mode').value='color';updateLabels();commitSettings();
    showPaletteMessage(`${result.method==='k-means'?'K-Means':'Median Cut'} generated ${result.colors.length} colors in ${result.durationMs.toFixed(2)} ms. Save locally to reuse it.`);
  }catch(error){showPaletteMessage(error.message);}
  finally{
    activeExtractionJob=null;
    $('extractPalette').disabled=false;
    $('cancelExtraction').hidden=true;
  }
});
$('cancelExtraction').addEventListener('click',()=>activeExtractionJob?.cancel('Palette extraction cancelled.'));
for(const id of ['comparePaletteA','comparePaletteB'])$(id).addEventListener('change',renderAlgorithmComparison);
$('editorPreset').addEventListener('change', () => {
  if ($('editorPreset').value) applyEditorPreset();
});
$('saveEditorPreset').addEventListener('click', saveEditorPreset);
$('deleteEditorPreset').addEventListener('click', deleteEditorPreset);
$('importEditorPreset').addEventListener('click', () => $('editorPresetFile').click());
$('exportEditorPresets').addEventListener('click', async () => {
  try {
    const blob=new Blob([presetStore.exportJSON()],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=url;link.download='sidali-ditherlab-editor-presets.json';
    document.body.append(link);link.click();link.remove();
    setTimeout(()=>resources.revokeObjectURL(url),30_000);
    $('editorPresetMessage').textContent='Editor presets exported.';
  } catch (error) {
    $('editorPresetMessage').textContent=error.message;
  }
});
$('editorPresetFile').addEventListener('change', async event => {
  const file=event.target.files?.[0];
  event.target.value='';
  if (!file) return;
  try {
    const text=await file.text();
    const added=presetStore.importJSON(text);
    populateEditorPresets();
    $('editorPresetMessage').textContent=`Imported ${added.length} editor preset${added.length===1?'':'s'}.`;
  } catch (error) {
    $('editorPresetMessage').textContent=error.message;
  }
});
function restoreSession() {
  const saved = sessionStore.load();
  if (!saved) return;
  applySettings(saved.settings);
  geometry = {...saved.geometry};
  if ($('geometryLabel')) $('geometryLabel').textContent = geometryLabel(geometry);
  setView(saved.view);
  applyTheme(saved.theme);
}

function setHoldingOriginal(value) {
  holdingOriginal = value;
  $('canvasStage').classList.toggle('holding-original', value);
  $('holdOriginal').setAttribute('aria-pressed', String(value));
}
$('holdOriginal').addEventListener('pointerdown', event => {
  event.preventDefault();
  setHoldingOriginal(true);
  try { $('holdOriginal').releasePointerCapture?.(event.pointerId); } catch {}
});
$('holdOriginal').addEventListener('pointerup', event => {
  event.preventDefault();
  setHoldingOriginal(false);
  try { $('holdOriginal').releasePointerCapture?.(event.pointerId); } catch {}
});
$('holdOriginal').addEventListener('pointercancel', () => setHoldingOriginal(false));
$('holdOriginal').addEventListener('lostpointercapture', () => setHoldingOriginal(false));

$('zoomIn').addEventListener('click', () => setZoom(zoom * 1.25));
$('zoomOut').addEventListener('click', () => setZoom(zoom / 1.25));
$('zoomValue').addEventListener('click', resetZoomAndPan);
$('zoomActual').addEventListener('click', () => setZoom(1));
function applyTheme(theme) {
  const next = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  $('brandLogo').src = next === 'light' ? 'assets/dither-orbit-lockup-light.svg' : 'assets/dither-orbit-lockup-dark.svg';
  document.querySelector('meta[name="theme-color"]').content = next === 'light' ? '#F3F5F2' : '#0B0D0E';
  $('theme').setAttribute('aria-label', next === 'light' ? 'Switch to dark theme' : 'Switch to light theme');
  scheduleSessionSave();
}
$('theme').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  applyTheme(next);
});
const canvasWrap = $('canvasWrap');
canvasWrap.addEventListener('pointerdown', event => { console.log('POINTERDOWN', {target:event.target?.id, spacePressed, button:event.button, pointerType:event.pointerType});
  if (!spacePressed && event.button !== 1) return;
  event.preventDefault();
  try { canvasWrap.setPointerCapture?.(event.pointerId); } catch {}
  panState = {
    x: event.clientX,
    y: event.clientY,
    scrollLeft: canvasWrap.scrollLeft,
    scrollTop: canvasWrap.scrollTop
  };
});
canvasWrap.addEventListener('lostpointercapture', () => {panState = null;});
canvasWrap.addEventListener('pointermove', event => {
  if (!panState) { console.log('PAN move ignored: no panState'); return; }
  event.preventDefault();
  canvasWrap.scrollLeft = Math.max(0, panState.scrollLeft - (event.clientX - panState.x));
  canvasWrap.scrollTop = Math.max(0, panState.scrollTop - (event.clientY - panState.y));
});
canvasWrap.addEventListener('pointerup', event => {
  if (!panState) return;
  event.preventDefault();
  panState = null;
});
canvasWrap.addEventListener('pointercancel', () => {panState = null;});
window.addEventListener('resize', () => {if (fitZoom) updateCanvasZoom();});
function isEditableKeyboardTarget(target) {
  if (!(target instanceof Element)) return false;
  const tag = target.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
}
function openShortcutsDialog() {
  $('shortcutsDialog').showModal();
}
function closeShortcutsDialog() {
  if ($('shortcutsDialog').open) $('shortcutsDialog').close();
}
$('compareLine').addEventListener('keydown', event => {
  const current = Number($('compare').value);
  const minimum = Number($('compare').getAttribute('aria-valuemin') ?? 0);
  const maximum = Number($('compare').getAttribute('aria-valuemax') ?? 100);
  const step = event.shiftKey ? 10 : 1;
  let value = current;
  if (event.key === 'ArrowLeft') value = Math.max(minimum, current - step);
  else if (event.key === 'ArrowRight') value = Math.min(maximum, current + step);
  else if (event.key === 'Home') value = minimum;
  else if (event.key === 'End') value = maximum;
  if (value !== current) {
    event.preventDefault();
    $('compare').value = String(value);
    updateComparison();
  }
});
window.addEventListener('keydown', event => {
  const modifier = event.ctrlKey || event.metaKey;
  const key = event.key?.toLowerCase?.() ?? '';
  if (modifier) {
    if (key === 'z') {
      event.preventDefault();
      (event.shiftKey ? $('redo') : $('undo')).click();
      return;
    }
    if (key === 'y') {
      event.preventDefault();
      $('redo').click();
      return;
    }
    if (key === 'o') {
      event.preventDefault();
      $('file').click();
      return;
    }
    if (key === 's') {
      event.preventDefault();
      $('download').click();
      return;
    }
    if (key === 'r') {
      event.preventDefault();
      resetSettings();
      return;
    }
    if (key === 'e') {
      event.preventDefault();
      $('download').click();
      return;
    }
  }
  if (isEditableKeyboardTarget(event.target)) return;
  if (key === ' ') {
    event.preventDefault();
    spacePressed = true;
    return;
  }
  if (key === '?') {
    event.preventDefault();
    openShortcutsDialog();
    return;
  }
  if (modifier) return;
  if (key === '+') { event.preventDefault(); setZoom(zoom * 1.25); return; }
  if (key === '-') { event.preventDefault(); setZoom(zoom / 1.25); return; }
  if (key === '0') { event.preventDefault(); resetZoomAndPan(); return; }
  if (key === '1') { event.preventDefault(); setZoom(1); return; }
});
window.addEventListener('keyup', event => {
  const key = event.key?.toLowerCase?.() ?? '';
  if (key === ' ') spacePressed = false;
});
$('shortcutsOpen').addEventListener('click', openShortcutsDialog);
$('shortcutsClose').addEventListener('click', closeShortcutsDialog);
$('clearSession').addEventListener('click', () => {
  sessionStore.clear();
  $('editorPresetMessage').textContent='Saved session cleared.';
});

updateLabels();
populateSelectors();
populateComparisonSelectors();
populateEditorPresets();
updateLabels();
updateHistoryButtons();
updateExportControls();
initializeExportCapabilities();
restoreSession();

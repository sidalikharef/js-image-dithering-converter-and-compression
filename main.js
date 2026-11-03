import {outputDimensions, processingDimensions, formatBytes} from './core.mjs';
import {ALGORITHMS, getAlgorithm, processImage} from './src/engine/registry.mjs';
import {PRESETS, getPreset} from './src/engine/presets.mjs';
import {createHistory} from './src/engine/history.mjs';
import {
  processColorImage, BUILT_IN_PALETTES, PALETTE_CATEGORIES, getPalette, createCustomPalette,
  updateCustomPalette, loadPalettes, savePalettes, parsePaletteJSON, serializePaletteJSON,
  extractPalette, COLOR_PRESETS, getColorPreset, validatePaletteColors, hexToRGB, rgbToHex
} from './src/engine/index.mjs';

const $ = id => document.getElementById(id);
const controls = ['width', 'grain', 'threshold', 'contrast', 'strength', 'quality', 'algorithm', 'matrixSize', 'orderedStrength', 'seed', 'randomness', 'serpentine', 'preset', 'mode', 'paletteId', 'distanceMethod', 'alphaMode', 'background', 'brightness', 'colorContrast', 'saturation', 'gamma', 'exposure', 'hue', 'temperature', 'tint'];
const defaults = {width:1200, grain:4, threshold:128, contrast:1, strength:1, quality:.75, algorithm:'floyd-steinberg', matrixSize:4, orderedStrength:1, seed:1, randomness:1, serpentine:false, preset:'', mode:'monochrome', paletteId:'black-white', distanceMethod:'rgb', alphaMode:'preserve', background:'#FFFFFF', brightness:0, colorContrast:1, saturation:1, gamma:1, exposure:0, hue:0, temperature:0, tint:0};
const history = createHistory(defaults);
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
let comparisonSerial = 0;

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
  return settings;
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

function commitSettings() {
  const current = getSettings();
  if (!history.push(current)) return;
  updateHistoryButtons();
}

function applySettings(settings) {
  for (const id of controls) {
    const element = $(id);
    if (!element) continue;
    if (element.type === 'checkbox') element.checked = !!settings[id];
    else element.value = settings[id] ?? defaults[id];
  }
  activePalette = {
    id:settings.paletteId ?? 'black-white',
    name:settings.paletteName ?? 'Black and White',
    colors:(settings.paletteColors ?? getPalette(settings.paletteId ?? 'black-white').colors).slice(),
    category:'Custom',description:'Current processing palette.',colorCount:(settings.paletteColors ?? []).length,
    editable:true,builtIn:false
  };
  if (BUILT_IN_PALETTES.some(item => item.id === activePalette.id)) activePalette = getPalette(activePalette.id);
  refreshPaletteSelector();
  renderPaletteEditor();
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
    $('brightnessValue').textContent = Number($('brightness').value).toFixed(2);
    $('colorContrastValue').textContent = `${Number($('colorContrast').value).toFixed(2)}×`;
    $('saturationValue').textContent = `${Number($('saturation').value).toFixed(2)}×`;
    $('gammaValue').textContent = Number($('gamma').value).toFixed(2);
    $('exposureValue').textContent = `${Number($('exposure').value).toFixed(1)} EV`;
    $('hueValue').textContent = `${$('hue').value}°`;
    $('temperatureValue').textContent = Number($('temperature').value).toFixed(2);
    $('tintValue').textContent = Number($('tint').value).toFixed(2);
  }
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
  const next={...getSettings(),...preset.settings,preset:preset.id};
  if(preset.settings.paletteId==='adaptive') {
    if(!source) {showPaletteMessage('Import an image before applying Adaptive 8-Color.');return;}
    const image=readSourcePixels(512);
    const result=extractPalette(image,{method:'median-cut',colorCount:8});
    if(result.colors.length<2) {showPaletteMessage('The source has fewer than two distinct visible colors.');return;}
    activePalette={id:'adaptive',name:'Adaptive 8-Color',colors:result.colors,category:'Custom',description:'Median Cut palette generated from this image.',colorCount:result.colors.length,editable:true,builtIn:false};
    next.paletteId=activePalette.id;next.paletteName=activePalette.name;next.paletteColors=activePalette.colors.slice();
    extractionDuration=result.durationMs;$('extractionTime').textContent=`${result.durationMs.toFixed(2)} ms`;
  } else {
    activePalette=getPalette(preset.settings.paletteId);
    next.paletteId=activePalette.id;next.paletteName=activePalette.name;next.paletteColors=activePalette.colors.slice();
  }
  $('preset').value=preset.id;
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
  if(COLOR_PRESETS.some(item=>item.id===presetId)) {
    applyColorPreset(presetId);
    return;
  }
  const preset = getPreset(presetId);
  const next = {...getSettings(), ...preset.settings, preset:preset.id};
  history.push(next);
  applySettings(next);
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
  const dimensions = outputDimensions(source.width, source.height, settings.width);
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
    sampleContext.drawImage(source, 0, 0, logical.width, logical.height);
    const pixels = sampleContext.getImageData(0, 0, logical.width, logical.height);
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
      adjustments:{
        brightness:settings.brightness,contrast:settings.colorContrast,saturation:settings.saturation,
        gamma:settings.gamma,exposure:settings.exposure,hue:settings.hue,
        temperature:settings.temperature,tint:settings.tint
      }
    };
    const renderCandidate=(algorithm,palette)=>{
      const key=JSON.stringify([sourceRevision,logical.width,logical.height,algorithm,settings.mode,settings.mode==='color'?palette.colors:null,colorSettings]);
      if(comparisonCache.has(key))return comparisonCache.get(key);
      const start=performance.now();
      const result=settings.mode==='color'
        ? processColorImage(pixels,{...colorSettings,algorithm,palette:palette.colors})
        : processImage(pixels,algorithm,resolveAlgorithmSettings(settings));
      const measured={output:result,durationMs:performance.now()-start};
      if(comparisonCache.size>=8)comparisonCache.delete(comparisonCache.keys().next().value);
      comparisonCache.set(key,measured);
      return measured;
    };
    const outputA = renderCandidate(algorithmA,paletteA);
    const outputB = renderCandidate(algorithmB,paletteB);

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
    if (serial === comparisonSerial) $('runAlgorithmCompare').disabled = false;
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

function colorProcessingSettings(settings) {
  return {
    palette:activePalette.colors,
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
    adjustments:{
      brightness:settings.brightness,contrast:settings.colorContrast,saturation:settings.saturation,
      gamma:settings.gamma,exposure:settings.exposure,hue:settings.hue,
      temperature:settings.temperature,tint:settings.tint
    }
  };
}

async function render() {
  const serial = ++renderSerial;
  latestBlob = null;
  $('download').disabled = true;
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
    const processStart = performance.now();
    const dithered = settings.mode==='color'
      ? processColorImage(pixels,colorProcessingSettings(settings))
      : processImage(pixels, settings.algorithm, resolveAlgorithmSettings(settings));
    processingDuration = performance.now() - processStart;
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

    const encodingStart = performance.now();
    const blob = await canvasToWebP(outputCanvas, settings.quality);
    encodingDuration = performance.now() - encodingStart;
    if (serial !== renderSerial) return;
    latestBlob = blob;
    $('placeholder').hidden = true;
    $('canvasStage').hidden = false;
    $('dimensions').textContent = `${dimensions.width} × ${dimensions.height}`;
    $('imageInfo').textContent = `${source.width} × ${source.height} px · ${formatBytes(sourceFileSize)}`;
    $('filesize').textContent = formatBytes(blob.size);
    $('processingTime').textContent = `${processingDuration.toFixed(2)} ms`;
    $('encodingTime').textContent = `${encodingDuration.toFixed(2)} ms`;
    $('metricAlgorithm').textContent = getAlgorithm(settings.algorithm).name;
    $('metricPreset').textContent = presetName(settings.preset);
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
  $('processingTime').textContent = '—';
  $('encodingTime').textContent = '—';
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(render, 130);
}

function resetSettings() {
  const current = getSettings();
  if (sameSettings(current, defaults)) return;
  history.push(defaults);
  applySettings(defaults);
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
    updateLabels();
    scheduleRender();
  });
  el.addEventListener('change', commitSettings);
}
$('reset').addEventListener('click', resetSettings);
$('resetProperties').addEventListener('click', resetSettings);
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
$('extractPalette').addEventListener('click',()=>{
  try {
    if(!source)throw new Error('Import an image before extracting a palette.');
    const result=extractPalette(readSourcePixels(512),{
      method:$('extractionMethod').value,colorCount:Number($('colorCount').value),seed:Number($('seed').value)
    });
    extractionDuration=result.durationMs;
    $('extractionTime').textContent=`${result.durationMs.toFixed(2)} ms · ${result.colors.length} colors`;
    if(result.colors.length<2)throw new Error('The image has fewer than two distinct visible colors; it cannot form a dither palette.');
    const palette=createCustomPalette(`Extracted ${result.colors.length}-Color`,result.colors);
    setActivePalette(palette);
    $('mode').value='color';updateLabels();commitSettings();
    showPaletteMessage(`${result.method==='k-means'?'K-Means':'Median Cut'} generated ${result.colors.length} colors in ${result.durationMs.toFixed(2)} ms. Save locally to reuse it.`);
  }catch(error){showPaletteMessage(error.message);}
});
for(const id of ['comparePaletteA','comparePaletteB'])$(id).addEventListener('change',renderAlgorithmComparison);
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
populateSelectors();
populateComparisonSelectors();
updateLabels();
updateHistoryButtons();

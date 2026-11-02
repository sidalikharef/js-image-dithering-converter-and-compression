import {outputDimensions, processingDimensions, ditherToTransparentBlack, formatBytes} from './core.mjs';

const $ = id => document.getElementById(id);
const controls = ['width', 'grain', 'threshold', 'contrast', 'strength', 'quality'];
const defaults = {width:1200, grain:4, threshold:128, contrast:1, strength:1, quality:.75};
let source = null;
let sourceName = 'image';
let latestBlob = null;
let renderSerial = 0;
let debounceTimer;

function updateLabels(){
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

function getSettings() {
  return Object.fromEntries(controls.map(id => [id, Number($(id).value)]));
}

async function render() {
  const serial = ++renderSerial;
  latestBlob = null;
  $('download').disabled = true;
  if (!source) return;
  const s = getSettings();
  $('status').textContent = 'Rendering image…';
  try {
    const dim = outputDimensions(source.width,source.height,s.width);
    if (dim.width > 32_767 || dim.height > 32_767 || dim.width * dim.height > 50_000_000) {
      throw new Error('Output exceeds the supported canvas size. Reduce the output width or use a less extreme aspect ratio.');
    }
    const logical = processingDimensions(dim.width, dim.height, s.grain);
    const low = document.createElement('canvas');
    low.width=logical.width;low.height=logical.height;
    const lc=low.getContext('2d',{willReadFrequently:true});
    if (!lc) throw new Error('Could not initialize 2D canvas.');
    lc.clearRect(0,0,logical.width,logical.height);
    lc.drawImage(source,0,0,logical.width,logical.height);
    const pixels=lc.getImageData(0,0,logical.width,logical.height);
    const dithered=ditherToTransparentBlack(pixels,s);
    lc.putImageData(new ImageData(dithered.data,logical.width,logical.height),0,0);
    const output=$('outputCanvas');
    output.width=dim.width;output.height=dim.height;
    const ctx=output.getContext('2d');
    if (!ctx) throw new Error('Could not initialize output canvas.');
    ctx.clearRect(0,0,dim.width,dim.height);
    ctx.imageSmoothingEnabled=false;
    ctx.drawImage(low,0,0,dim.width,dim.height);
    const blob=await canvasToWebP(output,s.quality);
    if (serial !== renderSerial) return;
    latestBlob=blob;
    $('placeholder').hidden=true;
    output.hidden=false;
    $('dimensions').textContent=`${dim.width} × ${dim.height}`;
    $('filesize').textContent=formatBytes(blob.size);
    $('target').textContent=blob.size<30*1024?'✓ Under 30 KiB':'Above target';
    $('target').style.color=blob.size<30*1024?'#9fe0ba':'#f0c595';
    $('download').disabled=false;
    $('status').textContent=`Ready — ${formatBytes(blob.size)} WebP.`;
  } catch(error) {
    if (serial !== renderSerial) return;
    $('status').textContent=error instanceof Error ? error.message : 'Rendering failed.';
    $('dimensions').textContent='—';$('filesize').textContent='—';$('target').textContent='—';
    $('placeholder').hidden=false;
    $('outputCanvas').hidden=true;
  }
}

function scheduleRender() {
  ++renderSerial; // invalidates an in-flight async WebP encode immediately
  latestBlob=null;
  $('download').disabled=true;
  clearTimeout(debounceTimer);
  debounceTimer=setTimeout(render,130);
}

for (const id of controls) $(id).addEventListener('input',()=>{updateLabels();scheduleRender();});
$('reset').addEventListener('click',()=>{
  for(const id of controls) $(id).value=defaults[id];
  updateLabels();scheduleRender();
});

async function chooseFile(file){
  if(!file)return;
  ++renderSerial;
  clearTimeout(debounceTimer);
  latestBlob=null;
  $('download').disabled=true;
  $('status').textContent='Decoding image…';
  const token=renderSerial;
  try {
    const image=await loadImage(file);
    if(token!==renderSerial){if(typeof image.close==='function')image.close();return;}
    if (image.width*image.height>50_000_000) {
      if (typeof image.close === 'function') image.close();
      throw new Error('Image exceeds the 50 megapixel input limit.');
    }
    if(source && typeof source.close==='function')source.close();
    source=image;
    sourceName=file.name;
    $('filename').textContent=`${file.name} · ${formatBytes(file.size)}`;
    await render();
  }catch(error){
    if(token!==renderSerial)return;
    $('status').textContent=error instanceof Error ? error.message : 'Failed to read image.';
  }
}
$('file').addEventListener('change',event=>{
  chooseFile(event.target.files?.[0]);
  event.target.value='';
});
for(const name of ['dragenter','dragover'])$('dropzone').addEventListener(name,e=>{e.preventDefault();$('dropzone').classList.add('dragover');});
for(const name of ['dragleave','drop'])$('dropzone').addEventListener(name,e=>{e.preventDefault();$('dropzone').classList.remove('dragover');});
$('dropzone').addEventListener('drop',e=>chooseFile(e.dataTransfer?.files?.[0]));
$('download').addEventListener('click',()=>{
  if(!latestBlob)return;
  const url=URL.createObjectURL(latestBlob);
  const a=document.createElement('a');
  a.href=url;a.download=sourceName.replace(/\.[^.]+$/,'')+'-dithered.webp';
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),10_000);
});
updateLabels();

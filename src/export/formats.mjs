export const EXPORT_FORMATS = Object.freeze({
  png:{mime:'image/png', extension:'png', lossy:false, quality:false, transparency:true},
  jpeg:{mime:'image/jpeg', extension:'jpg', lossy:true, quality:true, transparency:false},
  webp:{mime:'image/webp', extension:'webp', lossy:true, quality:true, transparency:true},
  avif:{mime:'image/avif', extension:'avif', lossy:true, quality:true, transparency:true}
});

export async function encodeCanvas(canvas, format, quality = 0.8, {background = '#FFFFFF'} = {}) {
  const definition = EXPORT_FORMATS[format];
  if (!definition) throw Object.assign(new RangeError(`Unsupported export format: ${format}`), {code:'UNSUPPORTED_FORMAT'});
  if (!Number.isFinite(quality) || quality < 0 || quality > 1) {
    throw Object.assign(new RangeError('Quality must be between zero and one.'), {code:'INVALID_QUALITY'});
  }
  const input = format === 'jpeg' ? compositeCanvas(canvas, background) : canvas;
  const blob = await new Promise((resolve,reject) => {
    if (typeof input.toBlob !== 'function') return reject(new Error('Canvas blob encoding is unavailable.'));
    try { input.toBlob(resolve, definition.mime, definition.quality ? quality : undefined); }
    catch (error) { reject(error); }
  });
  if (!blob) throw Object.assign(new Error(`${format.toUpperCase()} encoding failed.`), {code:'ENCODER_FAILED'});
  if (blob.type !== definition.mime) {
    throw Object.assign(new Error(`This browser did not encode ${format.toUpperCase()} (returned ${blob.type || 'unknown'}).`), {code:'UNSUPPORTED_ENCODER'});
  }
  return blob;
}

export async function detectExportCapabilities(createCanvas = () => document.createElement('canvas')) {
  const canvas = createCanvas();
  canvas.width = canvas.height = 1;
  const formats = {};
  for (const [format,definition] of Object.entries(EXPORT_FORMATS)) {
    try {
      formats[format] = (await encodeCanvas(canvas, format)).type === definition.mime;
    } catch { formats[format] = false; }
  }
  return {
    moduleWorkers:typeof Worker === 'function',
    offscreenCanvas:typeof OffscreenCanvas === 'function',
    imageBitmap:typeof createImageBitmap === 'function',
    clipboardImage:typeof ClipboardItem === 'function' && !!globalThis.navigator?.clipboard?.write,
    formats
  };
}

function compositeCanvas(canvas, background) {
  const output = document.createElement('canvas');
  output.width = canvas.width;
  output.height = canvas.height;
  const context = output.getContext('2d');
  if (!context) throw new Error('Could not create JPEG compositing canvas.');
  context.fillStyle = background;
  context.fillRect(0,0,output.width,output.height);
  context.drawImage(canvas,0,0);
  return output;
}

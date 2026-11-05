import {processImage} from '../engine/registry.mjs';
import {processColorImage} from '../engine/color/color-diffusion.mjs';
import {extractPalette} from '../engine/color/palette-extraction.mjs';
import {processEditorImage} from '../editor/pipeline.mjs';
import {
  createWorkerResponse, serializeWorkerError, validateWorkerRequest
} from './worker-protocol.mjs';

function typedPixels(payload) {
  const {width, height, buffer} = payload;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width < 1 || height < 1 || !(buffer instanceof ArrayBuffer) ||
      buffer.byteLength !== width * height * 4) {
    throw Object.assign(new TypeError('Worker image buffer dimensions are invalid.'), {code:'INVALID_IMAGE'});
  }
  return {data:new Uint8ClampedArray(buffer), width, height};
}

export function runWorkerOperation(request) {
  const payload = request.payload ?? {};
  if (request.type === 'get-capabilities') {
    return {
      moduleWorkers:typeof Worker === 'function',
      offscreenCanvas:typeof OffscreenCanvas === 'function',
      imageBitmap:typeof createImageBitmap === 'function'
    };
  }
  if (request.type === 'extract-palette') {
    return extractPalette(typedPixels(payload), payload.options);
  }
  if (request.type === 'process-image' || request.type === 'compare-images') {
    const started=performance.now();
    const image = typedPixels(payload);
    const output = payload.mode === 'color'
      ? processColorImage(image, payload.options)
      : processImage(image, payload.algorithm, payload.options);
    return {width:output.width,height:output.height,buffer:output.data.buffer,processingMs:performance.now()-started};
  }
  if (request.type === 'process-editor-image') {
    const started=performance.now();
    const output = processEditorImage(typedPixels(payload), {
      geometry:payload.geometry,
      adjustments:payload.adjustments,
      mode:payload.mode,
      algorithm:payload.algorithm,
      options:payload.options,
      palette:payload.palette,
      paletteMethod:payload.paletteMethod,
      alphaMode:payload.alphaMode,
      background:payload.background
    });
    return {width:output.width,height:output.height,buffer:output.data.buffer,processingMs:performance.now()-started};
  }
  throw Object.assign(new RangeError('Unsupported worker operation.'), {code:'UNKNOWN_OPERATION'});
}

export function installImageWorker(scope = globalThis) {
  const activeJobs = new Set();
  scope.addEventListener('message', event => {
    let request;
    try {
      request = validateWorkerRequest(event.data);
      if (activeJobs.has(request.jobId)) {
        throw Object.assign(new Error('A job with this ID is already running.'), {code:'DUPLICATE_JOB'});
      }
      activeJobs.add(request.jobId);
      scope.postMessage(createWorkerResponse(request.jobId, 'job-started'));
      const result = runWorkerOperation(request);
      const transfer = result?.buffer instanceof ArrayBuffer ? [result.buffer] : [];
      scope.postMessage(createWorkerResponse(request.jobId, 'job-completed', result), transfer);
    } catch (error) {
      const jobId = typeof request?.jobId === 'string' ? request.jobId :
        (typeof event.data?.jobId === 'string' ? event.data.jobId : 'invalid');
      scope.postMessage(createWorkerResponse(jobId, 'job-failed', {error:serializeWorkerError(error)}));
    } finally {
      if (request?.jobId) activeJobs.delete(request.jobId);
    }
  });
}

if (typeof WorkerGlobalScope !== 'undefined' && globalThis instanceof WorkerGlobalScope) {
  installImageWorker(globalThis);
}

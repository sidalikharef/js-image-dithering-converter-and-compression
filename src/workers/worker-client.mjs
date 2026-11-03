import {createWorkerRequest, validateWorkerResponse} from './worker-protocol.mjs';

let fallbackSequence = 0;

export function createImageProcessor({WorkerClass = globalThis.Worker, onExecutionMode = () => {}} = {}) {
  const workerAvailable = typeof WorkerClass === 'function';
  const jobs = new Map();

  function submit(type, payload, {id = `image-job-${++fallbackSequence}`, priority = 'medium'} = {}) {
    let settled = false;
    let worker = null;
    let rejectPromise;
    let resolvePromise;
    let fallbackStarted=false;
    const fallbackPayload=payload?.buffer instanceof ArrayBuffer
      ? {...payload,buffer:payload.buffer.slice(0)} : payload;
    const promise = new Promise((resolve,reject) => {
      rejectPromise = reject;
      resolvePromise = resolve;
      if (!workerAvailable) {
        runFallback();
        return;
      }
      try {
        worker = new WorkerClass(new URL('./image-worker.mjs', import.meta.url), {type:'module'});
      } catch {
        runFallback();
        return;
      }
      onExecutionMode('worker');
      const request = createWorkerRequest(id, type, payload);
      const onMessage = event => {
        const message = event.data;
        if (!validateWorkerResponse(message, id)) return;
        if (message.type === 'job-failed') {
          const error = new Error(message.payload?.error?.message ?? 'Image worker failed.');
          error.code = message.payload?.error?.code ?? 'PROCESSING_FAILED';
          reject(error);
        } else if (message.type === 'job-completed') resolve(message.payload);
      };
      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', () => runFallback(), {once:true});
      worker.addEventListener('messageerror', () => runFallback(), {once:true});
      const transfer = payload?.buffer instanceof ArrayBuffer ? [payload.buffer] : [];
      try { worker.postMessage(request, transfer); }
      catch { runFallback(); }
    });
    function runFallback() {
      if (settled || fallbackStarted) return;
      fallbackStarted=true;
      worker?.terminate();
      worker=null;
      onExecutionMode('main-thread-fallback');
      import('./image-worker.mjs').then(({runWorkerOperation}) => {
        if (!settled) resolvePromise(runWorkerOperation({type,payload:fallbackPayload}));
      }).catch(rejectPromise);
    }
    const done = promise.finally(() => {
      settled = true;
      worker?.terminate();
      jobs.delete(id);
    });
    const job = {
      id, priority, promise:done,
      cancel(reason = 'Cancelled by user.') {
        if (settled) return false;
        settled = true;
        worker?.terminate();
        jobs.delete(id);
        const error = new DOMException(String(reason), 'AbortError');
        rejectPromise(error);
        return true;
      }
    };
    jobs.set(id, job);
    return job;
  }

  return {
    submit,
    cancel(id, reason) { return jobs.get(id)?.cancel(reason) ?? false; },
    cancelAll(reason) { for (const job of [...jobs.values()]) job.cancel(reason); },
    get activeJobs() { return jobs.size; },
    get available() { return workerAvailable; }
  };
}

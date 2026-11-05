export const WORKER_PROTOCOL_VERSION = 1;
export const WORKER_OPERATIONS = Object.freeze([
  'process-image',
  'process-editor-image',
  'extract-palette',
  'compare-images',
  'get-capabilities'
]);

const JOB_ID_PATTERN = /^[a-zA-Z0-9._:-]{1,128}$/;

export function createWorkerRequest(jobId, type, payload = {}) {
  const message = {version:WORKER_PROTOCOL_VERSION, jobId, type, payload};
  validateWorkerRequest(message);
  return message;
}

export function validateWorkerRequest(message) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    throw new TypeError('Worker message must be an object.');
  }
  if (message.version !== WORKER_PROTOCOL_VERSION) {
    throw Object.assign(new RangeError('Unsupported worker protocol version.'), {code:'PROTOCOL_VERSION'});
  }
  if (typeof message.jobId !== 'string' || !JOB_ID_PATTERN.test(message.jobId)) {
    throw Object.assign(new TypeError('Invalid worker job ID.'), {code:'INVALID_JOB_ID'});
  }
  if (!WORKER_OPERATIONS.includes(message.type)) {
    throw Object.assign(new RangeError(`Unsupported worker operation: ${String(message.type)}`), {code:'UNKNOWN_OPERATION'});
  }
  if (message.payload !== undefined && (!message.payload || typeof message.payload !== 'object' || Array.isArray(message.payload))) {
    throw Object.assign(new TypeError('Worker payload must be an object.'), {code:'INVALID_PAYLOAD'});
  }
  return message;
}

export function serializeWorkerError(error) {
  return {
    code:typeof error?.code === 'string' ? error.code : 'PROCESSING_FAILED',
    message:error instanceof Error ? error.message : String(error)
  };
}

export function createWorkerResponse(jobId, type, payload = {}) {
  return {version:WORKER_PROTOCOL_VERSION, jobId, type, payload};
}

export function validateWorkerResponse(message, expectedJobId) {
  if (!message || message.version !== WORKER_PROTOCOL_VERSION ||
      typeof message.jobId !== 'string' || message.jobId !== expectedJobId) return false;
  return ['job-started','job-progress','job-completed','job-cancelled','job-failed','capabilities'].includes(message.type);
}

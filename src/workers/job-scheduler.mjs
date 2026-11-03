const PRIORITIES = Object.freeze({high:0, medium:1, low:2});
const TERMINAL = new Set(['completed','cancelled','failed']);

export class JobScheduler {
  #jobs = new Map();
  #queue = [];
  #running = 0;
  #sequence = 0;
  #concurrency;
  #closed = false;

  constructor({concurrency = 2, agingMs = 5_000, onStateChange = () => {}} = {}) {
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
      throw new RangeError('Concurrency must be an integer from 1 to 8.');
    }
    this.#concurrency = concurrency;
    this.agingMs = agingMs;
    this.onStateChange = onStateChange;
  }

  get size() { return this.#jobs.size; }
  get running() { return this.#running; }

  submit({id, priority = 'medium', run, signal} = {}) {
    if (this.#closed) throw new Error('Job scheduler is closed.');
    if (typeof id !== 'string' || !id || this.#jobs.has(id)) throw new TypeError('Job ID must be unique and non-empty.');
    if (!(priority in PRIORITIES)) throw new RangeError('Unknown job priority.');
    if (typeof run !== 'function') throw new TypeError('Job run must be a function.');
    if (signal?.aborted) return {id, promise:Promise.resolve({state:'cancelled'}), cancel:() => false};

    let resolvePromise;
    const promise = new Promise(resolve => { resolvePromise = resolve; });
    const job = {id, priority, run, resolve:resolvePromise, promise, state:'queued',
      sequence:this.#sequence++, queuedAt:Date.now(), controller:new AbortController(), externalSignal:signal};
    job.abortListener = () => this.cancel(id, signal.reason);
    signal?.addEventListener('abort', job.abortListener, {once:true});
    this.#jobs.set(id, job);
    this.#queue.push(job);
    this.#publish(job);
    this.#pump();
    return {id, promise, cancel:reason => this.cancel(id, reason)};
  }

  cancel(id, reason = 'Cancelled by user.') {
    const job = this.#jobs.get(id);
    if (!job || TERMINAL.has(job.state)) return false;
    job.controller.abort(reason);
    if (job.state === 'queued') {
      this.#queue = this.#queue.filter(candidate => candidate !== job);
      this.#finish(job, 'cancelled', {reason});
      this.#pump();
    }
    return true;
  }

  cancelAll(reason = 'Scheduler cancelled.') {
    for (const job of this.#jobs.values()) this.cancel(job.id, reason);
  }

  close() {
    this.#closed = true;
    this.cancelAll('Scheduler closed.');
  }

  getState(id) { return this.#jobs.get(id)?.state ?? null; }

  #publish(job) {
    this.onStateChange({id:job.id, state:job.state, priority:job.priority});
  }

  #finish(job, state, detail = {}) {
    job.state = state;
    job.externalSignal?.removeEventListener('abort', job.abortListener);
    this.#publish(job);
    job.resolve({state, ...detail});
  }

  #next() {
    const now = Date.now();
    this.#queue.sort((a,b) => {
      const score = job => PRIORITIES[job.priority] - Math.floor((now - job.queuedAt) / this.agingMs);
      return score(a) - score(b) || a.sequence - b.sequence;
    });
    return this.#queue.shift();
  }

  #pump() {
    while (!this.#closed && this.#running < this.#concurrency && this.#queue.length) {
      const job = this.#next();
      if (job.controller.signal.aborted) {
        this.#finish(job, 'cancelled', {reason:job.controller.signal.reason});
        continue;
      }
      this.#running++;
      job.state = 'running';
      this.#publish(job);
      Promise.resolve().then(() => job.run({signal:job.controller.signal, id:job.id}))
        .then(value => this.#finish(job, job.controller.signal.aborted ? 'cancelled' : 'completed',
          job.controller.signal.aborted ? {reason:job.controller.signal.reason} : {value}))
        .catch(error => this.#finish(job, job.controller.signal.aborted ? 'cancelled' : 'failed',
          job.controller.signal.aborted ? {reason:job.controller.signal.reason} : {error}))
        .finally(() => {
          this.#running--;
          if (this.#jobs.size > 256) {
            const terminal=[...this.#jobs.values()].filter(item=>TERMINAL.has(item.state));
            for (const old of terminal.slice(0,terminal.length-128)) this.#jobs.delete(old.id);
          }
          this.#pump();
        });
    }
  }
}

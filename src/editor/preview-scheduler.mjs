/**
 * Coalesces rapid preview requests and guarantees that only the newest request
 * can be reported as applied. Older requests are aborted and any result they
 * produce after being superseded is marked stale.
 */
export class PreviewScheduler {
  #delay;
  #setTimer;
  #clearTimer;
  #timer = null;
  #controller = null;
  #sequence = 0;
  #active = 0;
  #pending = null;

  constructor({
    delay = 120,
    setTimer = (callback, milliseconds) => setTimeout(callback, milliseconds),
    clearTimer = id => clearTimeout(id)
  } = {}) {
    if (!Number.isFinite(delay) || delay < 0) throw new RangeError('Preview delay must be a non-negative number.');
    this.#delay = delay;
    this.#setTimer = setTimer;
    this.#clearTimer = clearTimer;
  }

  schedule(run, {delay = this.#delay} = {}) {
    if (typeof run !== 'function') throw new TypeError('Preview work must be a function.');
    if (!Number.isFinite(delay) || delay < 0) throw new RangeError('Preview delay must be a non-negative number.');

    const sequence = ++this.#sequence;
    if (this.#pending) {
      this.#clearTimer(this.#pending.timer);
      this.#pending.resolve({status: 'stale', sequence: this.#pending.sequence});
      this.#pending = null;
      this.#controller?.abort('Superseded by a newer preview.');
      this.#controller = null;
    }
    if (this.#timer !== null) {
      this.#clearTimer(this.#timer);
      this.#timer = null;
    }
    const controller = new AbortController();
    this.#controller = controller;

    const promise = new Promise(resolve => {
      this.#pending = {sequence, resolve};
      this.#timer = this.#setTimer(async () => {
        this.#timer = null;
        if (sequence !== this.#sequence) {
          this.#pending?.resolve({status: 'stale', sequence});
          this.#pending = null;
          return;
        }
        this.#pending = null;
        this.#active++;
        try {
          const value = await run({signal: controller.signal, sequence});
          resolve({
            status: sequence === this.#sequence ? 'applied' : 'stale',
            sequence,
            value
          });
        } catch (error) {
          resolve({
            status: controller.signal.aborted || error?.name === 'AbortError' ? 'cancelled' : 'failed',
            sequence,
            error
          });
        } finally {
          this.#active--;
        }
      }, delay);
    });

    return {
      sequence,
      promise,
      cancel: reason => controller.abort(reason)
    };
  }

  cancel(reason = 'Preview cancelled.') {
    this.#sequence++;
    if (this.#pending) {
      this.#pending.resolve({status: 'cancelled', sequence: this.#pending.sequence});
      this.#pending = null;
    }
    if (this.#timer !== null) {
      this.#clearTimer(this.#timer);
      this.#timer = null;
    }
    const controller = this.#controller;
    this.#controller = null;
    controller?.abort(reason);
  }

  get sequence() { return this.#sequence; }
  get active() { return this.#active; }
  get pending() { return this.#timer !== null; }
}

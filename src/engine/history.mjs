export function createHistory(initialSettings, limit = 50) {
  const undo = [];
  const redo = [];
  let current = structuredClone(initialSettings);
  let lastCoalesceKey = null;
  let lastCoalesceTime = 0;

  function push(settings, {coalesceKey = null, coalesceMs = 0, now = Date.now()} = {}) {
    if (JSON.stringify(settings) === JSON.stringify(current)) return false;
    const coalesce = coalesceKey !== null && coalesceKey === lastCoalesceKey
      && Number.isFinite(coalesceMs) && coalesceMs > 0
      && now - lastCoalesceTime <= coalesceMs;
    if (!coalesce) {
      undo.push(current);
      if (undo.length > limit) undo.shift();
    }
    redo.length = 0;
    current = structuredClone(settings);
    lastCoalesceKey = coalesceKey;
    lastCoalesceTime = now;
    return true;
  }

  function reset(settings) {
    undo.length = 0;
    redo.length = 0;
    current = structuredClone(settings);
    lastCoalesceKey = null;
    lastCoalesceTime = 0;
  }

  return {
    push,
    reset,
    undo() {
      if (!undo.length) return null;
      redo.push(current);
      current = undo.pop();
      lastCoalesceKey = null;
      return structuredClone(current);
    },
    redo() {
      if (!redo.length) return null;
      undo.push(current);
      if (undo.length > limit) undo.shift();
      current = redo.pop();
      lastCoalesceKey = null;
      return structuredClone(current);
    },
    get current() { return structuredClone(current); },
    get canUndo() { return undo.length > 0; },
    get canRedo() { return redo.length > 0; },
    get size() { return undo.length; }
  };
}

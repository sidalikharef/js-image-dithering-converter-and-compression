export function createHistory(initialSettings, limit = 50) {
  const undo = [];
  const redo = [];
  let current = structuredClone(initialSettings);

  function push(settings) {
    if (JSON.stringify(settings) === JSON.stringify(current)) return false;
    undo.push(current);
    if (undo.length > limit) undo.shift();
    redo.length = 0;
    current = structuredClone(settings);
    return true;
  }

  return {
    push,
    undo() {
      if (!undo.length) return null;
      redo.push(current);
      current = undo.pop();
      return structuredClone(current);
    },
    redo() {
      if (!redo.length) return null;
      undo.push(current);
      current = redo.pop();
      return structuredClone(current);
    },
    get current() { return structuredClone(current); },
    get canUndo() { return undo.length > 0; },
    get canRedo() { return redo.length > 0; }
  };
}

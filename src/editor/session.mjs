import {
  EDITOR_STATE_VERSION,
  createEditorState,
  normalizeSettings,
  normalizeTheme,
  normalizeView
} from './state.mjs';
import {validateGeometry} from './transforms.mjs';

export const SESSION_STORAGE_KEY = 'sidali-ditherlab:session:v1';
export const SESSION_SCHEMA_VERSION = 1;

function resolveStorage(storage) {
  if (storage !== undefined) return storage;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function normalizeSession(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  if (input.schemaVersion !== SESSION_SCHEMA_VERSION) return null;
  try {
    const state = createEditorState({
      settings: normalizeSettings(input.settings),
      geometry: validateGeometry(input.geometry),
      view: normalizeView(input.view),
      theme: normalizeTheme(input.theme)
    });
    return state;
  } catch {
    return null;
  }
}

export function loadSession(storage) {
  const target = resolveStorage(storage);
  if (!target) return null;
  let text;
  try { text = target.getItem(SESSION_STORAGE_KEY); } catch { return null; }
  if (!text) return null;
  let parsed;
  try { parsed = JSON.parse(text); } catch { return null; }
  return normalizeSession(parsed);
}

export function saveSession(state, storage) {
  const target = resolveStorage(storage);
  if (!target) return false;
  const normalized = normalizeSession({
    schemaVersion: SESSION_SCHEMA_VERSION,
    settings: state?.settings,
    geometry: state?.geometry,
    view: state?.view,
    theme: state?.theme
  });
  if (!normalized) return false;
  try {
    target.setItem(SESSION_STORAGE_KEY, JSON.stringify({
      schemaVersion: SESSION_SCHEMA_VERSION,
      savedAt: Date.now(),
      settings: normalized.settings,
      geometry: normalized.geometry,
      view: normalized.view,
      theme: normalized.theme
    }));
    return true;
  } catch {
    return false;
  }
}

export function clearSession(storage) {
  const target = resolveStorage(storage);
  if (!target) return false;
  try {
    target.removeItem(SESSION_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function createSessionStore({
  storage,
  delay = 400,
  setTimer = (callback, milliseconds) => setTimeout(callback, milliseconds),
  clearTimer = id => clearTimeout(id)
} = {}) {
  let timer = null;
  let pending = null;

  function flush() {
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
    if (!pending) return false;
    const state = pending;
    pending = null;
    return saveSession(state, storage);
  }

  function schedule(state) {
    pending = state;
    if (timer !== null) clearTimer(timer);
    timer = setTimer(() => {
      timer = null;
      flush();
    }, delay);
  }

  function clear() {
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
    pending = null;
    return clearSession(storage);
  }

  return {
    load: () => loadSession(storage),
    schedule,
    flush,
    clear,
    dispose() {
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
      pending = null;
    },
    get pending() { return timer !== null; }
  };
}

export {EDITOR_STATE_VERSION};

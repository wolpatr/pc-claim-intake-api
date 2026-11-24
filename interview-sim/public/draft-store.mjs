// Versioned localStorage drafts so offline-authored code survives a reload.
// Storage is injected so the same contract runs in the browser and the validator.

const DRAFT_PREFIX = 'interview-sim.draft.v1';
const DRAFT_VERSION = 1;

function draftKey(scenarioId, phase, kind) {
  return `${DRAFT_PREFIX}:${encodeURIComponent(scenarioId)}:${encodeURIComponent(phase)}:${kind}`;
}

function parseDraft(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== DRAFT_VERSION || typeof parsed.text !== 'string') return null;
    return { text: parsed.text, savedAt: Number(parsed.savedAt) || 0 };
  } catch {
    return null;
  }
}

export function readDraft(storage, scenarioId, phase, kind) {
  if (!storage) return null;
  try {
    return parseDraft(storage.getItem(draftKey(scenarioId, phase, kind)));
  } catch {
    return null;
  }
}

export function writeDraft(storage, scenarioId, phase, kind, text) {
  if (!storage || typeof text !== 'string') return false;
  try {
    storage.setItem(draftKey(scenarioId, phase, kind), JSON.stringify({
      version: DRAFT_VERSION,
      savedAt: Date.now(),
      text,
    }));
    return true;
  } catch {
    return false;
  }
}

export function clearDrafts(storage, scenarioId) {
  if (!storage) return false;
  const prefix = `${DRAFT_PREFIX}:${encodeURIComponent(scenarioId)}:`;
  try {
    const keys = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (typeof key === 'string' && key.startsWith(prefix)) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

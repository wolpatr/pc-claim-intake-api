import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const progressDir = path.join(here, '..', 'progress');
const MAX_RECORD_BYTES = 250000;

function safeSegment(value) {
  return String(value || 'session').replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 48);
}

export async function appendProgress(record) {
  const payload = { ...record, savedAt: new Date().toISOString() };
  const serialized = JSON.stringify(payload, null, 2);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_RECORD_BYTES) {
    throw new Error('Progress record is too large.');
  }
  await mkdir(progressDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const id = `${stamp}-${safeSegment(record.scenarioId)}-${randomUUID().slice(0, 8)}`;
  const file = path.join(progressDir, `${id}.json`);
  await writeFile(file, serialized, 'utf8');
  return { ...payload, id };
}

export async function readProgress() {
  let names = [];
  try {
    names = await readdir(progressDir);
  } catch {
    return [];
  }
  const records = [];
  for (const name of names.filter((entry) => entry.endsWith('.json'))) {
    try {
      const raw = await readFile(path.join(progressDir, name), 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        records.push({ ...parsed, id: parsed.id || name.replace(/\.json$/, '') });
      }
    } catch {
      /* ignore corrupt partial writes */
    }
  }
  records.sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || '')));
  return records.slice(0, 300);
}

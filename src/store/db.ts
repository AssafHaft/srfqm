import { createStore, del, entries, set, type UseStore } from 'idb-keyval';

/** Thin persistence layer over IndexedDB. Data never leaves the device except through user-initiated JSON export. */

let idb: UseStore | null = null;
const pending = new Map<string, () => unknown>();
let timer: ReturnType<typeof setTimeout> | null = null;

export const QUOTE_PREFIX = 'quote:';

function db(): UseStore {
  idb ??= createStore('srfqm', 'kv');
  return idb;
}

export async function loadAll(): Promise<Map<string, unknown>> {
  const all = await entries(db());
  return new Map(all.map(([k, v]) => [String(k), v]));
}

/** Debounced write; the value is read at flush time so rapid edits coalesce into one write. */
export function scheduleSave(key: string, read: () => unknown): void {
  pending.set(key, read);
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void flushSaves(), 400);
}

export async function flushSaves(): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = null;
  const batch = [...pending.entries()];
  pending.clear();
  await Promise.all(
    batch.map(([key, read]) => {
      const value = read();
      return value === undefined ? del(key, db()) : set(key, value, db());
    }),
  );
}

export async function replaceAll(values: Map<string, unknown>): Promise<void> {
  pending.clear();
  const existing = await entries(db());
  await Promise.all(existing.map(([k]) => del(k, db())));
  await Promise.all([...values.entries()].map(([k, v]) => set(k, v, db())));
}

export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

if (typeof window !== 'undefined') {
  const flush = () => void flushSaves();
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}

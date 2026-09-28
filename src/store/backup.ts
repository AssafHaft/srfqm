import { normalizeCatalog, normalizeQuote, normalizeSettings } from '../model/normalize';
import type { Catalog, Quote, Settings } from '../model/types';

export const BACKUP_APP_ID = 'srfqm';
export const BACKUP_VERSION = 1;

export type BackupKind = 'backup' | 'catalog';

export interface BackupFile {
  app: typeof BACKUP_APP_ID;
  kind: BackupKind;
  version: number;
  exportedAt: string;
  settings?: Settings;
  catalog: Catalog;
  quotes?: Quote[];
}

export function buildBackup(kind: BackupKind, data: { settings: Settings; catalog: Catalog; quotes: Quote[] }): BackupFile {
  const base = { app: BACKUP_APP_ID, kind, version: BACKUP_VERSION, exportedAt: new Date().toISOString() } as const;
  return kind === 'catalog'
    ? { ...base, catalog: data.catalog }
    : { ...base, settings: data.settings, catalog: data.catalog, quotes: data.quotes };
}

export class BackupError extends Error {}

/** Parses and validates a backup or price-list file. Throws BackupError with a user-facing (Hebrew) message. */
export function parseBackup(text: string): BackupFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError('הקובץ אינו קובץ JSON תקין.');
  }
  if (typeof raw !== 'object' || raw === null || (raw as { app?: unknown }).app !== BACKUP_APP_ID) {
    throw new BackupError('הקובץ אינו קובץ גיבוי של מחולל הצעות המחיר.');
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.version === 'number' && o.version > BACKUP_VERSION) {
    throw new BackupError('הקובץ נוצר בגרסה חדשה יותר של האפליקציה. יש לרענן את האפליקציה ולנסות שוב.');
  }
  const kind: BackupKind = o.kind === 'catalog' ? 'catalog' : 'backup';
  const catalog = normalizeCatalog(o.catalog);
  if (kind === 'catalog') {
    return { app: BACKUP_APP_ID, kind, version: BACKUP_VERSION, exportedAt: String(o.exportedAt ?? ''), catalog };
  }
  const quotes = (Array.isArray(o.quotes) ? o.quotes : []).map(normalizeQuote).filter((q): q is Quote => q !== null);
  return {
    app: BACKUP_APP_ID,
    kind,
    version: BACKUP_VERSION,
    exportedAt: String(o.exportedAt ?? ''),
    settings: normalizeSettings(o.settings),
    catalog,
    quotes,
  };
}

export function downloadJson(data: unknown, fileName: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

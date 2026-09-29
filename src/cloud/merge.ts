import type { Quote } from '../model/types';

/** A quote document in the cloud. Deleted quotes are kept as tombstones so offline devices learn about the deletion. */
export interface RemoteQuote {
  id: string;
  updatedAt: string;
  deleted: boolean;
  quote: Quote | null;
}

export interface Reconciliation {
  /** Newer in the cloud: install locally. */
  putLocal: Quote[];
  /** Deleted in the cloud after the last local edit. */
  deleteLocal: string[];
  /** Newer (or only) on this device: upload. */
  upload: Quote[];
}

/** Last-writer-wins merge of this device's quotes with the cloud's, by `updatedAt`. */
export function reconcile(local: Quote[], remote: RemoteQuote[]): Reconciliation {
  const result: Reconciliation = { putLocal: [], deleteLocal: [], upload: [] };
  const localById = new Map(local.map((q) => [q.id, q]));
  const seen = new Set<string>();
  for (const r of remote) {
    seen.add(r.id);
    const l = localById.get(r.id);
    if (r.deleted || !r.quote) {
      if (l && l.updatedAt > r.updatedAt) result.upload.push(l);
      else if (l) result.deleteLocal.push(r.id);
      continue;
    }
    if (!l || r.updatedAt > l.updatedAt) result.putLocal.push(r.quote);
    else if (l.updatedAt > r.updatedAt) result.upload.push(l);
  }
  for (const l of local) if (!seen.has(l.id)) result.upload.push(l);
  return result;
}

/** Applies one incoming cloud change to the local list. */
export function incoming(local: Quote | undefined, r: RemoteQuote): 'put' | 'delete' | 'ignore' {
  if (r.deleted || !r.quote) return local && local.updatedAt <= r.updatedAt ? 'delete' : 'ignore';
  return !local || r.updatedAt > local.updatedAt ? 'put' : 'ignore';
}

import { describe, expect, it } from 'vitest';
import { normalizeQuote } from '../model/normalize';
import type { Quote } from '../model/types';
import { incoming, reconcile, type RemoteQuote } from './merge';

const q = (id: string, updatedAt: string): Quote => ({ ...normalizeQuote({ id })!, updatedAt, number: id });
const r = (quote: Quote): RemoteQuote => ({ id: quote.id, updatedAt: quote.updatedAt, deleted: false, quote });
const tomb = (id: string, updatedAt: string): RemoteQuote => ({ id, updatedAt, deleted: true, quote: null });

describe('reconcile', () => {
  it('merges both directions by last edit', () => {
    const local = [q('a', '2026-09-01'), q('b', '2026-09-05'), q('c', '2026-09-03')];
    const remote = [r(q('a', '2026-09-02')), r(q('b', '2026-09-04')), r(q('d', '2026-09-01'))];
    const res = reconcile(local, remote);
    expect(res.putLocal.map((x) => x.id)).toEqual(['a', 'd']);
    expect(res.upload.map((x) => x.id)).toEqual(['b', 'c']);
    expect(res.deleteLocal).toEqual([]);
  });

  it('applies deletions from other devices, unless edited here afterwards', () => {
    const local = [q('a', '2026-09-01'), q('b', '2026-09-09')];
    const res = reconcile(local, [tomb('a', '2026-09-02'), tomb('b', '2026-09-03'), tomb('z', '2026-09-03')]);
    expect(res.deleteLocal).toEqual(['a']);
    expect(res.upload.map((x) => x.id)).toEqual(['b']);
    expect(res.putLocal).toEqual([]);
  });

  it('is a no-op when both sides match', () => {
    const a = q('a', '2026-09-01');
    expect(reconcile([a], [r(a)])).toEqual({ putLocal: [], deleteLocal: [], upload: [] });
  });
});

describe('incoming', () => {
  it('ignores stale changes and applies newer ones', () => {
    const local = q('a', '2026-09-05');
    expect(incoming(local, r(q('a', '2026-09-04')))).toBe('ignore');
    expect(incoming(local, r(q('a', '2026-09-06')))).toBe('put');
    expect(incoming(undefined, r(q('a', '2026-09-01')))).toBe('put');
    expect(incoming(local, tomb('a', '2026-09-06'))).toBe('delete');
    expect(incoming(local, tomb('a', '2026-09-01'))).toBe('ignore');
  });
});

import { describe, expect, it } from 'vitest';
import { DEFAULT_CATALOG, DEFAULT_SETTINGS } from '../model/defaults';
import { BackupError, buildBackup, parseBackup } from './backup';

describe('backup files', () => {
  it('round-trips a full backup', () => {
    const file = buildBackup('backup', { settings: DEFAULT_SETTINGS, catalog: DEFAULT_CATALOG, quotes: [] });
    const parsed = parseBackup(JSON.stringify(file));
    expect(parsed.kind).toBe('backup');
    expect(parsed.catalog.categories).toHaveLength(DEFAULT_CATALOG.categories.length);
    expect(parsed.settings?.vatRate).toBe(DEFAULT_SETTINGS.vatRate);
  });

  it('accepts a price-list file and repairs partial data', () => {
    const parsed = parseBackup(
      JSON.stringify({ app: 'srfqm', kind: 'catalog', version: 1, catalog: { categories: [{ id: 'x', name: 'X' }], items: [{ name: 'שיעור', price: 150 }] } }),
    );
    expect(parsed.kind).toBe('catalog');
    expect(parsed.catalog.categories.map((c) => c.id)).toEqual(['x', 'other']);
    expect(parsed.catalog.items[0]).toMatchObject({ name: 'שיעור', price: 150, categoryId: 'other' });
    expect(parsed.catalog.items[0].id).toBeTruthy();
  });

  it('keeps packages in price-list files and defaults them for older files', () => {
    const pkg = { id: 'p1', name: 'יום הולדת', description: '', items: [{ catalogId: 'x', qty: 12, categoryId: 'events', name: 'שיעור', description: '', unitPrice: 150, priceIncludesVat: true }] };
    const file = buildBackup('catalog', { settings: DEFAULT_SETTINGS, catalog: { ...DEFAULT_CATALOG, packages: [pkg] }, quotes: [] });
    expect(parseBackup(JSON.stringify(file)).catalog.packages).toEqual([pkg]);
    const old = parseBackup(JSON.stringify({ app: 'srfqm', kind: 'catalog', version: 1, catalog: { categories: [], items: [] } }));
    expect(old.catalog.packages).toEqual([]);
  });

  it('rejects files that are not backups', () => {
    expect(() => parseBackup('not json')).toThrow(BackupError);
    expect(() => parseBackup('{"hello":1}')).toThrow(BackupError);
    expect(() => parseBackup('{"app":"srfqm","version":99}')).toThrow(BackupError);
  });
});

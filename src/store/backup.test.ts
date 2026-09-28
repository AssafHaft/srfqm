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

  it('rejects files that are not backups', () => {
    expect(() => parseBackup('not json')).toThrow(BackupError);
    expect(() => parseBackup('{"hello":1}')).toThrow(BackupError);
    expect(() => parseBackup('{"app":"srfqm","version":99}')).toThrow(BackupError);
  });
});

import { describe, expect, it } from 'vitest';
import type { CatalogItem, LineItem } from '../model/types';
import { mergeLines, packageFromLines, packageLines, packageTotal } from './packages';

const lesson: CatalogItem = { id: 'lesson', categoryId: 'events', name: 'שיעור גלישה', description: '60 דקות', price: 150 };
const pizza: CatalogItem = { id: 'pizza', categoryId: 'food', name: 'מגש פיצה', description: '', price: 89.9 };
const catalog = { items: [lesson, pizza], pricesIncludeVat: true };

const line = (over: Partial<LineItem>): LineItem => ({
  id: Math.random().toString(36),
  categoryId: 'other',
  name: 'x',
  description: '',
  qty: 1,
  unitPrice: 0,
  priceIncludesVat: true,
  ...over,
});

describe('packages', () => {
  const quoteLines = [
    line({ catalogId: 'lesson', categoryId: 'events', name: 'שיעור גלישה', description: '60 דקות', qty: 12, unitPrice: 150 }),
    line({ catalogId: 'pizza', categoryId: 'food', name: 'מגש פיצה', qty: 3, unitPrice: 80 }), // price edited in the quote
    line({ name: 'עוגת יום הולדת', qty: 1, unitPrice: 120 }),
  ];
  const pkg = packageFromLines('  יום הולדת  ', quoteLines, catalog, 18);

  it('keeps catalog links only for unedited catalog lines', () => {
    expect(pkg.name).toBe('יום הולדת');
    expect(pkg.items.map((i) => i.catalogId)).toEqual(['lesson', undefined, undefined]);
    expect(pkg.items[1]).toMatchObject({ name: 'מגש פיצה', unitPrice: 80, qty: 3 });
  });

  it('uses current catalog prices for linked items', () => {
    const repriced = { ...catalog, items: [{ ...lesson, price: 160 }, pizza] };
    const lines = packageLines(pkg, repriced);
    expect(lines.map((l) => [l.name, l.qty, l.unitPrice])).toEqual([
      ['שיעור גלישה', 12, 160],
      ['מגש פיצה', 3, 80],
      ['עוגת יום הולדת', 1, 120],
    ]);
    expect(new Set(lines.map((l) => l.id)).size).toBe(3);
  });

  it('falls back to the snapshot when the catalog item was deleted', () => {
    const lines = packageLines(pkg, { ...catalog, items: [] });
    expect(lines[0]).toMatchObject({ name: 'שיעור גלישה', unitPrice: 150 });
    expect(lines[0].catalogId).toBeUndefined();
  });

  it('computes the package total in either VAT basis', () => {
    expect(packageTotal(pkg, catalog, true, 18)).toBe(12 * 15000 + 3 * 8000 + 12000);
    expect(packageTotal(pkg, catalog, false, 18)).toBe(12 * 12712 + 3 * 6780 + 10169);
  });

  it('merges catalog lines already in the quote by quantity', () => {
    const existing = [line({ id: 'a', catalogId: 'lesson', qty: 2 }), line({ id: 'b', name: 'עוגה', qty: 1 })];
    const merged = mergeLines(existing, packageLines(pkg, catalog));
    expect(merged).toHaveLength(4);
    expect(merged[0].qty).toBe(14);
    expect(existing[0].qty).toBe(2);
  });
});

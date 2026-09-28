import { describe, expect, it } from 'vitest';
import type { Catalog } from '../model/types';
import { catalogToSheets, catalogToXlsx, sheetsToCatalog, SHEET_CATEGORIES, SHEET_ITEMS, xlsxToCatalog, type SheetInput } from './excel';

const catalog: Catalog = {
  categories: [
    { id: 'events', name: 'אירועים' },
    { id: 'food', name: 'מזון' },
    { id: 'other', name: 'שונות' },
  ],
  items: [
    { id: 'lesson', categoryId: 'events', name: 'שיעור גלישה', description: '60 דקות', price: 150 },
    { id: 'pizza', categoryId: 'food', name: 'מגש פיצה', description: '', price: 89.9 },
    { id: 'cake', categoryId: 'food', name: 'עוגה', description: '', price: 120 },
  ],
  packages: [{ id: 'p', name: 'יום הולדת', description: '', items: [] }],
};

/** What read-excel-file returns: plain values, styles dropped. */
const asInput = (c: Catalog): SheetInput[] =>
  catalogToSheets(c, true).map((s) => ({ sheet: s.sheet, data: s.data.map((row) => row.map((cell) => (cell ? cell.value : null))) }));

describe('Excel catalog round-trip', () => {
  it('is lossless when nothing was edited', () => {
    const r = sheetsToCatalog(asInput(catalog), catalog);
    expect(r.errors).toEqual([]);
    expect(r.catalog).toEqual(catalog);
    expect(Object.values(r.diff).flat()).toEqual([]);
  });

  it('applies edits, additions, deletions and new categories', () => {
    const sheets = asInput(catalog);
    const items = sheets.find((s) => s.sheet === SHEET_ITEMS)!.data;
    // rows: header, lesson, pizza, cake (sorted by category)
    items[1][3] = 160; // price change
    items.splice(3, 1); // delete cake
    items.push(['השכרה', 'השכרת גלשן', '', '₪ 80', null]); // new product in a new category
    items.push([null, null, null, null, null]); // blank row is ignored
    const cats = sheets.find((s) => s.sheet === SHEET_CATEGORIES)!.data;
    cats[2][0] = 'אוכל ושתייה'; // rename "מזון"

    const r = sheetsToCatalog(sheets, catalog);
    expect(r.errors).toEqual([]);
    expect(r.diff).toEqual({
      addedItems: ['השכרת גלשן'],
      updatedItems: ['שיעור גלישה'],
      removedItems: ['עוגה'],
      addedCategories: ['השכרה'],
      renamedCategories: ['מזון ← אוכל ושתייה'],
      removedCategories: [],
    });
    const board = r.catalog.items.find((i) => i.name === 'השכרת גלשן')!;
    expect(board.price).toBe(80);
    expect(r.catalog.categories.find((c) => c.id === board.categoryId)?.name).toBe('השכרה');
    expect(r.catalog.packages).toBe(catalog.packages);
  });

  it('reports rows it cannot read instead of guessing', () => {
    const sheets = asInput(catalog);
    const items = sheets.find((s) => s.sheet === SHEET_ITEMS)!.data;
    items.push(['אירועים', '', 'תיאור בלי שם', 10, null]);
    items.push(['אירועים', 'מוצר', '', 'חינם', null]);
    const r = sheetsToCatalog(sheets, catalog);
    expect(r.errors).toEqual(['שורה 5: חסר שם פריט.', 'שורה 6 ("מוצר"): המחיר "חינם" אינו מספר תקין.']);
  });

  it('treats a copied row (duplicate ID) as a new product', () => {
    const sheets = asInput(catalog);
    const items = sheets.find((s) => s.sheet === SHEET_ITEMS)!.data;
    items.push([...items[1]]);
    const r = sheetsToCatalog(sheets, catalog);
    expect(r.catalog.items).toHaveLength(4);
    expect(new Set(r.catalog.items.map((i) => i.id)).size).toBe(4);
  });

  it('survives a real .xlsx file', async () => {
    const blob = await catalogToXlsx(catalog, true);
    const r = await xlsxToCatalog(blob, catalog);
    expect(r.errors).toEqual([]);
    expect(r.catalog.items).toEqual(catalog.items);
    expect(r.catalog.categories).toEqual(catalog.categories);
  });
});

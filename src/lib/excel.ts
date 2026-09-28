import { OTHER_CATEGORY_ID } from '../model/defaults';
import type { Catalog, CatalogItem, Category } from '../model/types';
import { newId } from './ids';
import { parseNumber } from './money';

/*
 * Excel round-trip for the catalog. The workbook has a products sheet, a categories sheet and an
 * instructions sheet. Products refer to categories by name, so anyone can edit it in Excel;
 * the hidden-in-plain-sight ID column lets an import update existing products instead of duplicating them.
 */

export const SHEET_ITEMS = 'מוצרים';
export const SHEET_CATEGORIES = 'קטגוריות';
export const SHEET_HELP = 'הוראות';

const H = {
  category: 'קטגוריה',
  name: 'שם הפריט',
  description: 'תיאור',
  price: 'מחיר',
  id: 'מזהה (לא לשנות)',
  categoryName: 'שם הקטגוריה',
};

type Cell = string | number | boolean | Date | null | undefined;
export interface SheetInput {
  sheet: string;
  data: Cell[][];
}

interface StyledCell {
  value: string | number;
  fontWeight?: 'bold';
  backgroundColor?: string;
  textColor?: string;
  wrap?: boolean;
}

export interface SheetOutput {
  sheet: string;
  data: (StyledCell | null)[][];
  columns: { width: number }[];
  rightToLeft: true;
  stickyRowsCount?: number;
}

const header = (value: string): StyledCell => ({ value, fontWeight: 'bold', backgroundColor: '#2b4a54', textColor: '#ffffff' });
const muted = (value: string): StyledCell => ({ value, textColor: '#8a999d' });
const cell = (value: string | number): StyledCell | null => (value === '' ? null : { value });

export function catalogToSheets(catalog: Catalog, pricesIncludeVat: boolean): SheetOutput[] {
  const catName = new Map(catalog.categories.map((c) => [c.id, c.name]));
  const order = new Map(catalog.categories.map((c, i) => [c.id, i]));
  const items = catalog.items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => (order.get(a.item.categoryId) ?? 999) - (order.get(b.item.categoryId) ?? 999) || a.i - b.i)
    .map((x) => x.item);

  const priceHeader = `${H.price} (${pricesIncludeVat ? 'כולל מע"מ' : 'לפני מע"מ'})`;
  return [
    {
      sheet: SHEET_ITEMS,
      rightToLeft: true,
      stickyRowsCount: 1,
      columns: [{ width: 22 }, { width: 36 }, { width: 48 }, { width: 16 }, { width: 40 }],
      data: [
        [header(H.category), header(H.name), header(H.description), header(priceHeader), header(H.id)],
        ...items.map((it) => [
          cell(catName.get(it.categoryId) ?? catName.get(OTHER_CATEGORY_ID) ?? ''),
          cell(it.name),
          it.description ? { value: it.description, wrap: true } : null,
          { value: it.price },
          muted(it.id),
        ]),
      ],
    },
    {
      sheet: SHEET_CATEGORIES,
      rightToLeft: true,
      stickyRowsCount: 1,
      columns: [{ width: 30 }, { width: 40 }],
      data: [[header(H.categoryName), header(H.id)], ...catalog.categories.map((c) => [cell(c.name), muted(c.id)])],
    },
    {
      sheet: SHEET_HELP,
      rightToLeft: true,
      columns: [{ width: 110 }],
      data: [
        [{ value: 'איך מעדכנים את הקטלוג', fontWeight: 'bold' }],
        [cell('• לשונית "מוצרים": כל שורה היא מוצר. אפשר לשנות שם, תיאור, מחיר וקטגוריה.')],
        [cell('• מוצר חדש: מוסיפים שורה ומשאירים את עמודת המזהה ריקה.')],
        [cell('• מחיקת מוצר: מוחקים את כל השורה.')],
        [cell('• קטגוריה חדשה: פשוט כותבים שם קטגוריה חדש בעמודה "קטגוריה" (או מוסיפים שורה בלשונית "קטגוריות").')],
        [cell('• לשונית "קטגוריות": סדר השורות קובע את סדר הקבוצות בהצעת המחיר. אפשר לשנות שם קטגוריה.')],
        [cell('• אין לשנות או להעתיק את עמודת "מזהה" — היא מקשרת כל שורה למוצר הקיים.')],
        [cell(`• המחירים ${pricesIncludeVat ? 'כוללים' : 'אינם כוללים'} מע"מ. כותבים מספר בלבד, בלי ₪.`)],
        [cell('• בסיום: שומרים את הקובץ (xlsx), ובאפליקציה לוחצים "ייבוא מאקסל" ואחר כך "פרסום לאתר".')],
      ],
    },
  ];
}

export interface CatalogDiff {
  addedItems: string[];
  updatedItems: string[];
  removedItems: string[];
  addedCategories: string[];
  renamedCategories: string[];
  removedCategories: string[];
}

export interface ImportResult {
  catalog: Catalog;
  diff: CatalogDiff;
  errors: string[];
}

const text = (v: Cell): string => (v === null || v === undefined ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim());
const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

function findColumns(headerRow: Cell[], wanted: Record<string, (h: string) => boolean>): Record<string, number> {
  const out: Record<string, number> = {};
  headerRow.forEach((h, i) => {
    const t = text(h);
    for (const [key, test] of Object.entries(wanted)) if (out[key] === undefined && test(t)) out[key] = i;
  });
  return out;
}

export function diffIsEmpty(d: CatalogDiff): boolean {
  return Object.values(d).every((list) => list.length === 0);
}

/**
 * Turns the edited workbook back into a catalog. The Excel file is the source of truth for products and
 * categories (rows removed in Excel are removed from the catalog); packages are kept as they are.
 */
export function sheetsToCatalog(sheets: SheetInput[], current: Catalog): ImportResult {
  const errors: string[] = [];
  const itemsSheet = sheets.find((s) => s.sheet.trim() === SHEET_ITEMS) ?? sheets[0];
  const catSheet = sheets.find((s) => s.sheet.trim() === SHEET_CATEGORIES);
  if (!itemsSheet || itemsSheet.data.length === 0) {
    return { catalog: current, diff: emptyDiff(), errors: [`לא נמצאה לשונית "${SHEET_ITEMS}" בקובץ.`] };
  }

  // ---- categories
  const categories: Category[] = [];
  const byName = new Map<string, Category>();
  const usedCatIds = new Set<string>();
  const addCategory = (name: string, id?: string) => {
    const existing = byName.get(norm(name));
    if (existing) return existing;
    const known = id && !usedCatIds.has(id) && current.categories.some((c) => c.id === id) ? id : undefined;
    const cat = { id: known ?? newId(), name: name.trim() };
    usedCatIds.add(cat.id);
    categories.push(cat);
    byName.set(norm(cat.name), cat);
    return cat;
  };

  if (catSheet && catSheet.data.length > 0) {
    const cols = findColumns(catSheet.data[0], { name: (h) => h.startsWith('שם'), id: (h) => h.startsWith('מזהה') });
    if (cols.name === undefined) errors.push(`בלשונית "${SHEET_CATEGORIES}" חסרה העמודה "${H.categoryName}".`);
    else {
      catSheet.data.slice(1).forEach((row) => {
        const name = text(row[cols.name]);
        if (name) addCategory(name, cols.id !== undefined ? text(row[cols.id]) : undefined);
      });
    }
  } else {
    current.categories.forEach((c) => addCategory(c.name, c.id));
  }

  // ---- items
  const cols = findColumns(itemsSheet.data[0], {
    category: (h) => h.startsWith('קטגוריה'),
    name: (h) => h.startsWith('שם'),
    description: (h) => h.startsWith('תיאור'),
    price: (h) => h.startsWith('מחיר'),
    id: (h) => h.startsWith('מזהה'),
  });
  for (const key of ['name', 'price'] as const) {
    if (cols[key] === undefined) errors.push(`בלשונית "${SHEET_ITEMS}" חסרה העמודה "${key === 'name' ? H.name : H.price}".`);
  }
  if (errors.length) return { catalog: current, diff: emptyDiff(), errors };

  // A category renamed on the categories sheet may still appear under its old name on product rows.
  const resolveCategory = (name: string) => {
    const direct = byName.get(norm(name));
    if (direct) return direct;
    const old = current.categories.find((c) => norm(c.name) === norm(name));
    return (old && categories.find((c) => c.id === old.id)) || addCategory(name);
  };

  const currentById = new Map(current.items.map((i) => [i.id, i]));
  const usedIds = new Set<string>();
  const items: CatalogItem[] = [];
  itemsSheet.data.slice(1).forEach((row, i) => {
    const rowNo = i + 2;
    const get = (key: string) => (cols[key] === undefined ? '' : text(row[cols[key]]));
    const name = get('name');
    const rawPrice = cols.price === undefined ? null : row[cols.price];
    const description = get('description');
    const catName = get('category');
    if (!name && !description && !catName && (rawPrice === null || rawPrice === undefined || text(rawPrice) === '')) return;
    if (!name) {
      errors.push(`שורה ${rowNo}: חסר שם פריט.`);
      return;
    }
    const price = typeof rawPrice === 'number' ? rawPrice : parseNumber(text(rawPrice));
    if (!Number.isFinite(price) || price < 0) {
      errors.push(`שורה ${rowNo} ("${name}"): המחיר "${text(rawPrice)}" אינו מספר תקין.`);
      return;
    }
    const category = catName
      ? resolveCategory(catName)
      : (categories.find((c) => c.id === OTHER_CATEGORY_ID) ?? addCategory('שונות', OTHER_CATEGORY_ID));
    const rawId = get('id');
    const id = rawId && currentById.has(rawId) && !usedIds.has(rawId) ? rawId : newId();
    usedIds.add(id);
    items.push({ id, categoryId: category.id, name, description, price: Math.round(price * 100) / 100 });
  });

  if (!categories.some((c) => c.id === OTHER_CATEGORY_ID)) {
    const existingOther = current.categories.find((c) => c.id === OTHER_CATEGORY_ID);
    categories.push({ id: OTHER_CATEGORY_ID, name: existingOther?.name ?? 'שונות' });
  }

  const catalog: Catalog = { categories, items, packages: current.packages };
  return { catalog, diff: diffCatalogs(current, catalog), errors };
}

function emptyDiff(): CatalogDiff {
  return { addedItems: [], updatedItems: [], removedItems: [], addedCategories: [], renamedCategories: [], removedCategories: [] };
}

export function diffCatalogs(before: Catalog, after: Catalog): CatalogDiff {
  const d = emptyDiff();
  const beforeItems = new Map(before.items.map((i) => [i.id, i]));
  const afterItems = new Map(after.items.map((i) => [i.id, i]));
  for (const it of after.items) {
    const old = beforeItems.get(it.id);
    if (!old) d.addedItems.push(it.name);
    else if (old.name !== it.name || old.description !== it.description || old.price !== it.price || old.categoryId !== it.categoryId)
      d.updatedItems.push(it.name);
  }
  for (const it of before.items) if (!afterItems.has(it.id)) d.removedItems.push(it.name);
  const beforeCats = new Map(before.categories.map((c) => [c.id, c]));
  const afterCats = new Set(after.categories.map((c) => c.id));
  for (const c of after.categories) {
    const old = beforeCats.get(c.id);
    if (!old) d.addedCategories.push(c.name);
    else if (old.name !== c.name) d.renamedCategories.push(`${old.name} ← ${c.name}`);
  }
  for (const c of before.categories) if (!afterCats.has(c.id)) d.removedCategories.push(c.name);
  return d;
}

// ---- file I/O (libraries loaded only when needed)

export async function catalogToXlsx(catalog: Catalog, pricesIncludeVat: boolean): Promise<Blob> {
  const { default: writeExcelFile } = await import('write-excel-file/universal');
  const sheets = catalogToSheets(catalog, pricesIncludeVat);
  return writeExcelFile(sheets as never, { fontFamily: 'Arial', fontSize: 11 }).toBlob();
}

export async function xlsxToCatalog(file: Blob, current: Catalog): Promise<ImportResult> {
  const { default: readExcelFile } = await import('read-excel-file/universal');
  let sheets: SheetInput[];
  try {
    sheets = (await readExcelFile(file)) as SheetInput[];
  } catch {
    return { catalog: current, diff: emptyDiff(), errors: ['לא ניתן לקרוא את הקובץ. יש לשמור אותו בפורמט Excel ‏(‎.xlsx‎).'] };
  }
  return sheetsToCatalog(sheets, current);
}

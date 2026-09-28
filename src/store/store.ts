import { batch, signal } from '@preact/signals';
import { newId } from '../lib/ids';
import { todayISO } from '../lib/dates';
import { sortByCategory } from '../lib/items';
import { takeQuoteNumber } from '../lib/numbering';
import { mergeLines, packageFromLines, packageLines, type CatalogContext } from '../lib/packages';
import { DEFAULT_CATALOG, DEFAULT_SETTINGS, OTHER_CATEGORY_ID } from '../model/defaults';
import { normalizeCatalog, normalizeQuote, normalizeSettings } from '../model/normalize';
import type { Catalog, CatalogItem, Category, LineItem, Package, Quote, Settings } from '../model/types';
import { buildBackup, type BackupFile, type BackupKind } from './backup';
import { QUOTE_PREFIX, flushSaves, loadAll, replaceAll, requestPersistence, scheduleSave } from './db';

export const settings = signal<Settings>(DEFAULT_SETTINGS);
export const catalog = signal<Catalog>(DEFAULT_CATALOG);
/** Most recently updated first. */
export const quotes = signal<Quote[]>([]);
export const ready = signal(false);
export const storageAvailable = signal(true);
export const storagePersisted = signal(false);

const sortQuotes = (list: Quote[]) => list.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

export async function initStore(): Promise<void> {
  try {
    const all = await loadAll();
    const loaded: Quote[] = [];
    for (const [key, value] of all) {
      if (key.startsWith(QUOTE_PREFIX)) {
        const q = normalizeQuote(value);
        if (q) loaded.push(q);
      }
    }
    batch(() => {
      if (all.has('settings')) settings.value = normalizeSettings(all.get('settings'));
      if (all.has('catalog')) catalog.value = normalizeCatalog(all.get('catalog'));
      quotes.value = sortQuotes(loaded);
    });
    storagePersisted.value = await requestPersistence();
  } catch (err) {
    console.error('Local storage unavailable', err);
    storageAvailable.value = false;
  }
  ready.value = true;
}

// ---------- settings ----------

export function updateSettings(patch: Partial<Settings>): void {
  settings.value = { ...settings.value, ...patch };
  scheduleSave('settings', () => settings.value);
}

// ---------- quotes ----------

export function getQuote(id: string): Quote | undefined {
  return quotes.value.find((q) => q.id === id);
}

function putQuote(q: Quote): void {
  quotes.value = sortQuotes([q, ...quotes.value.filter((x) => x.id !== q.id)]);
  scheduleSave(QUOTE_PREFIX + q.id, () => getQuote(q.id));
}

function nextNumber(): string {
  const { number, settings: next } = takeQuoteNumber(settings.value);
  updateSettings(next);
  return number;
}

export function createQuote(): Quote {
  const s = settings.value;
  const now = new Date().toISOString();
  const q: Quote = {
    id: newId(),
    number: nextNumber(),
    status: 'draft',
    issueDate: todayISO(),
    validDays: s.defaultValidDays,
    eventDate: '',
    customer: { name: '', details: '', phone: '', email: '' },
    items: [],
    pricesIncludeVat: s.defaultPricesIncludeVat,
    vatRate: s.vatRate,
    discount: { type: 'none', value: 0, includesVat: s.defaultPricesIncludeVat },
    notes: s.defaultNotes,
    createdAt: now,
    updatedAt: now,
  };
  putQuote(q);
  return q;
}

/** Applies `recipe` to a deep copy of the quote and saves it. */
export function updateQuote(id: string, recipe: (draft: Quote) => void): void {
  const current = getQuote(id);
  if (!current) return;
  const draft = structuredClone(current);
  recipe(draft);
  draft.updatedAt = new Date().toISOString();
  putQuote(draft);
}

export function duplicateQuote(id: string): Quote | undefined {
  const source = getQuote(id);
  if (!source) return undefined;
  const now = new Date().toISOString();
  const copy: Quote = {
    ...structuredClone(source),
    id: newId(),
    number: nextNumber(),
    status: 'draft',
    issueDate: todayISO(),
    vatRate: settings.value.vatRate,
    items: source.items.map((it) => ({ ...it, id: newId() })),
    createdAt: now,
    updatedAt: now,
  };
  putQuote(copy);
  return copy;
}

/**
 * Removes a quote that was created but never filled in (e.g. "new quote" clicked by mistake),
 * and gives its number back if it was the last one issued.
 */
export function discardIfPristine(id: string): void {
  const q = getQuote(id);
  if (!q || q.items.length > 0 || q.customer.name.trim() || q.createdAt !== q.updatedAt) return;
  deleteQuote(id);
  const s = settings.value;
  const { number: previous } = takeQuoteNumber({ ...s, nextNumber: s.nextNumber - 1 });
  if (s.nextNumber > 1 && previous === q.number) updateSettings({ nextNumber: s.nextNumber - 1 });
}

export function deleteQuote(id: string): void {
  quotes.value = quotes.value.filter((q) => q.id !== id);
  scheduleSave(QUOTE_PREFIX + id, () => undefined);
}

export function lineFromCatalog(item: CatalogItem): LineItem {
  return {
    id: newId(),
    catalogId: item.id,
    categoryId: item.categoryId,
    name: item.name,
    description: item.description,
    qty: 1,
    unitPrice: item.price,
    priceIncludesVat: settings.value.catalogPricesIncludeVat,
  };
}

export function blankLine(categoryId: string, pricesIncludeVat: boolean): LineItem {
  return {
    id: newId(),
    categoryId,
    name: '',
    description: '',
    qty: 1,
    unitPrice: 0,
    priceIncludesVat: pricesIncludeVat,
  };
}

/** Adds a catalog item to a quote; if it is already there, bumps its quantity instead. */
export function addCatalogItemToQuote(quoteId: string, item: CatalogItem): void {
  updateQuote(quoteId, (q) => {
    const existing = q.items.find((it) => it.catalogId === item.id);
    if (existing) existing.qty += 1;
    else q.items = sortByCategory([...q.items, lineFromCatalog(item)], catalog.value.categories);
  });
}

// ---------- packages ----------

export function catalogContext(): CatalogContext {
  return { items: catalog.value.items, pricesIncludeVat: settings.value.catalogPricesIncludeVat };
}

/** Adds every line of a package to a quote (catalog items already in the quote get their quantity raised). */
export function addPackageToQuote(quoteId: string, pkg: Package): void {
  const lines = packageLines(pkg, catalogContext());
  updateQuote(quoteId, (q) => {
    q.items = sortByCategory(mergeLines(q.items, lines), catalog.value.categories);
  });
}

export function savePackageFromQuote(quoteId: string, name: string): Package | undefined {
  const q = getQuote(quoteId);
  if (!q || q.items.length === 0 || !name.trim()) return undefined;
  const pkg = packageFromLines(name, sortByCategory(q.items, catalog.value.categories), catalogContext(), q.vatRate);
  upsertPackage(pkg);
  return pkg;
}

export function upsertPackage(pkg: Package): void {
  const list = catalog.value.packages;
  const exists = list.some((p) => p.id === pkg.id);
  putCatalog({ ...catalog.value, packages: exists ? list.map((p) => (p.id === pkg.id ? pkg : p)) : [...list, pkg] });
}

export function deletePackage(id: string): void {
  putCatalog({ ...catalog.value, packages: catalog.value.packages.filter((p) => p.id !== id) });
}

// ---------- catalog ----------

function putCatalog(next: Catalog): void {
  catalog.value = next;
  scheduleSave('catalog', () => catalog.value);
}

export function upsertCatalogItem(item: CatalogItem): void {
  const items = catalog.value.items;
  const exists = items.some((i) => i.id === item.id);
  putCatalog({ ...catalog.value, items: exists ? items.map((i) => (i.id === item.id ? item : i)) : [...items, item] });
}

export function deleteCatalogItem(id: string): void {
  putCatalog({ ...catalog.value, items: catalog.value.items.filter((i) => i.id !== id) });
}

export function setCategories(categories: Category[]): void {
  putCatalog({ ...catalog.value, categories });
}

export function deleteCategory(id: string): void {
  if (id === OTHER_CATEGORY_ID) return;
  const c = catalog.value;
  putCatalog({
    ...c,
    categories: c.categories.filter((x) => x.id !== id),
    items: c.items.map((i) => (i.categoryId === id ? { ...i, categoryId: OTHER_CATEGORY_ID } : i)),
  });
}

// ---------- backup ----------

export function exportData(kind: BackupKind): BackupFile {
  const file = buildBackup(kind, { settings: settings.value, catalog: catalog.value, quotes: quotes.value });
  if (kind === 'backup') updateSettings({ lastBackupAt: file.exportedAt });
  return file;
}

/** Full backup: replaces everything. Price list: replaces the catalog only. */
export async function importData(file: BackupFile): Promise<void> {
  await flushSaves();
  if (file.kind === 'catalog') {
    putCatalog(file.catalog);
    await flushSaves();
    return;
  }
  const nextSettings = file.settings ?? settings.value;
  const nextQuotes = file.quotes ?? [];
  const values = new Map<string, unknown>([
    ['settings', nextSettings],
    ['catalog', file.catalog],
    ...nextQuotes.map((q) => [QUOTE_PREFIX + q.id, q] as [string, unknown]),
  ]);
  await replaceAll(values);
  batch(() => {
    settings.value = nextSettings;
    catalog.value = file.catalog;
    quotes.value = sortQuotes(nextQuotes);
  });
}

import { newId } from '../lib/ids';
import { todayISO } from '../lib/dates';
import { DEFAULT_CATALOG, DEFAULT_SETTINGS, OTHER_CATEGORY_ID } from './defaults';
import type { Catalog, CatalogItem, Category, Discount, LineItem, Package, PackageItem, Quote, QuoteStatus, Settings } from './types';

/**
 * Defensive normalizers: data comes from IndexedDB or user-supplied JSON files, possibly written
 * by an older version of the app, so every field is validated and defaulted.
 */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);
const STATUSES: QuoteStatus[] = ['draft', 'sent', 'accepted', 'declined'];

export function normalizeSettings(v: unknown): Settings {
  const o = isObj(v) ? v : {};
  const d = DEFAULT_SETTINGS;
  return {
    vatRate: Math.max(0, num(o.vatRate, d.vatRate)),
    defaultValidDays: Math.max(0, Math.round(num(o.defaultValidDays, d.defaultValidDays))),
    numberPrefix: str(o.numberPrefix, d.numberPrefix),
    nextNumber: Math.max(1, Math.round(num(o.nextNumber, d.nextNumber))),
    numberYear: Math.round(num(o.numberYear, d.numberYear)),
    defaultPricesIncludeVat: bool(o.defaultPricesIncludeVat, d.defaultPricesIncludeVat),
    catalogPricesIncludeVat: bool(o.catalogPricesIncludeVat, d.catalogPricesIncludeVat),
    defaultNotes: str(o.defaultNotes, d.defaultNotes),
    lastBackupAt: typeof o.lastBackupAt === 'string' ? o.lastBackupAt : null,
  };
}

function normalizeCategory(v: unknown): Category | null {
  if (!isObj(v) || !str(v.id)) return null;
  return { id: str(v.id), name: str(v.name, 'ללא שם') };
}

function normalizeCatalogItem(v: unknown): CatalogItem | null {
  if (!isObj(v)) return null;
  return {
    id: str(v.id) || newId(),
    categoryId: str(v.categoryId, OTHER_CATEGORY_ID),
    name: str(v.name),
    description: str(v.description),
    price: num(v.price),
  };
}

export function normalizeCatalog(v: unknown): Catalog {
  const o = isObj(v) ? v : {};
  const categories = (Array.isArray(o.categories) ? o.categories : DEFAULT_CATALOG.categories)
    .map(normalizeCategory)
    .filter((c): c is Category => c !== null);
  if (!categories.some((c) => c.id === OTHER_CATEGORY_ID)) categories.push({ id: OTHER_CATEGORY_ID, name: 'שונות' });
  const items = (Array.isArray(o.items) ? o.items : [])
    .map(normalizeCatalogItem)
    .filter((i): i is CatalogItem => i !== null);
  const packages = (Array.isArray(o.packages) ? o.packages : [])
    .map(normalizePackage)
    .filter((p): p is Package => p !== null);
  return { categories, items, packages };
}

function normalizePackageItem(v: unknown): PackageItem | null {
  if (!isObj(v)) return null;
  return {
    catalogId: typeof v.catalogId === 'string' ? v.catalogId : undefined,
    qty: num(v.qty, 1),
    categoryId: str(v.categoryId, OTHER_CATEGORY_ID),
    name: str(v.name),
    description: str(v.description),
    unitPrice: num(v.unitPrice),
    priceIncludesVat: bool(v.priceIncludesVat, true),
  };
}

function normalizePackage(v: unknown): Package | null {
  if (!isObj(v)) return null;
  return {
    id: str(v.id) || newId(),
    name: str(v.name, 'חבילה'),
    description: str(v.description),
    items: (Array.isArray(v.items) ? v.items : []).map(normalizePackageItem).filter((i): i is PackageItem => i !== null),
  };
}

function normalizeLine(v: unknown): LineItem | null {
  if (!isObj(v)) return null;
  return {
    id: str(v.id) || newId(),
    catalogId: typeof v.catalogId === 'string' ? v.catalogId : undefined,
    categoryId: str(v.categoryId, OTHER_CATEGORY_ID),
    name: str(v.name),
    description: str(v.description),
    qty: num(v.qty, 1),
    unitPrice: num(v.unitPrice),
    priceIncludesVat: bool(v.priceIncludesVat, true),
  };
}

function normalizeDiscount(v: unknown): Discount {
  const o = isObj(v) ? v : {};
  const type = o.type === 'percent' || o.type === 'amount' ? o.type : 'none';
  return { type, value: Math.max(0, num(o.value)), includesVat: bool(o.includesVat, true) };
}

export function normalizeQuote(v: unknown): Quote | null {
  if (!isObj(v) || !str(v.id)) return null;
  const c = isObj(v.customer) ? v.customer : {};
  const now = new Date().toISOString();
  return {
    id: str(v.id),
    number: str(v.number),
    status: STATUSES.includes(v.status as QuoteStatus) ? (v.status as QuoteStatus) : 'draft',
    issueDate: str(v.issueDate) || todayISO(),
    validDays: Math.max(0, Math.round(num(v.validDays, DEFAULT_SETTINGS.defaultValidDays))),
    eventDate: str(v.eventDate),
    customer: { name: str(c.name), details: str(c.details), phone: str(c.phone), email: str(c.email) },
    items: (Array.isArray(v.items) ? v.items : []).map(normalizeLine).filter((i): i is LineItem => i !== null),
    pricesIncludeVat: bool(v.pricesIncludeVat, true),
    vatRate: Math.max(0, num(v.vatRate, DEFAULT_SETTINGS.vatRate)),
    discount: normalizeDiscount(v.discount),
    notes: str(v.notes),
    createdAt: str(v.createdAt) || now,
    updatedAt: str(v.updatedAt) || now,
  };
}

import type { CatalogItem, LineItem, Package, PackageItem } from '../model/types';
import { newId } from './ids';
import { convertPrice, priceLine } from './pricing';

export interface CatalogContext {
  items: CatalogItem[];
  /** Settings.catalogPricesIncludeVat */
  pricesIncludeVat: boolean;
}

/** Resolves a package line: catalog-linked lines use the catalog's current data, others their snapshot. */
export function resolvePackageItem(pi: PackageItem, catalog: CatalogContext): Omit<LineItem, 'id'> {
  const c = pi.catalogId ? catalog.items.find((i) => i.id === pi.catalogId) : undefined;
  if (c) {
    return {
      catalogId: c.id,
      categoryId: c.categoryId,
      name: c.name,
      description: c.description,
      qty: pi.qty,
      unitPrice: c.price,
      priceIncludesVat: catalog.pricesIncludeVat,
    };
  }
  return {
    categoryId: pi.categoryId,
    name: pi.name,
    description: pi.description,
    qty: pi.qty,
    unitPrice: pi.unitPrice,
    priceIncludesVat: pi.priceIncludesVat,
  };
}

export function packageLines(pkg: Package, catalog: CatalogContext): LineItem[] {
  return pkg.items.map((pi) => ({ id: newId(), ...resolvePackageItem(pi, catalog) }));
}

/** Adds lines to a quote; a catalog item already in the quote gets its quantity increased instead of a duplicate line. */
export function mergeLines(existing: LineItem[], incoming: LineItem[]): LineItem[] {
  const result = existing.map((l) => ({ ...l }));
  for (const line of incoming) {
    const same = line.catalogId ? result.find((l) => l.catalogId === line.catalogId) : undefined;
    if (same) same.qty = Number((same.qty + line.qty).toFixed(3));
    else result.push(line);
  }
  return result;
}

/**
 * Builds a package from quote lines. A line stays linked to its catalog item only while it still
 * matches it (same name, description and price); lines edited in the quote are kept as snapshots.
 */
export function packageFromLines(name: string, lines: LineItem[], catalog: CatalogContext, vatRate: number): Package {
  const items = lines.map((l): PackageItem => {
    const c = l.catalogId ? catalog.items.find((i) => i.id === l.catalogId) : undefined;
    const price = convertPrice(l.unitPrice, l.priceIncludesVat, catalog.pricesIncludeVat, vatRate);
    const linked = !!c && c.name === l.name && c.description === l.description && Math.abs(price - c.price) < 0.005;
    return {
      catalogId: linked ? c!.id : undefined,
      qty: l.qty,
      categoryId: l.categoryId,
      name: l.name,
      description: l.description,
      unitPrice: l.unitPrice,
      priceIncludesVat: l.priceIncludesVat,
    };
  });
  return { id: newId(), name: name.trim(), description: '', items };
}

/** Package total in agorot, in the requested display basis. */
export function packageTotal(pkg: Package, catalog: CatalogContext, pricesIncludeVat: boolean, vatRate: number): number {
  return pkg.items.reduce((sum, pi) => sum + priceLine(resolvePackageItem(pi, catalog), pricesIncludeVat, vatRate).total, 0);
}

/** Shared data model. Everything here is stored locally (IndexedDB) and in JSON backups — never in the site's files. */

export interface Category {
  id: string;
  name: string;
}

export interface CatalogItem {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  /** Default price. Whether it includes VAT is set catalog-wide in Settings.catalogPricesIncludeVat. */
  price: number;
}

/**
 * One line of a package. Items linked to the catalog (`catalogId`) always use the catalog's current
 * name and price; the snapshot fields are used for one-off items or if the catalog item was deleted.
 */
export interface PackageItem {
  catalogId?: string;
  qty: number;
  categoryId: string;
  name: string;
  description: string;
  unitPrice: number;
  priceIncludesVat: boolean;
}

/** A ready-made offer (e.g. birthday party) that adds several lines to a quote in one click. */
export interface Package {
  id: string;
  name: string;
  description: string;
  items: PackageItem[];
}

export interface Catalog {
  categories: Category[];
  items: CatalogItem[];
  packages: Package[];
}

export interface LineItem {
  id: string;
  /** Catalog item this line was created from, if any. */
  catalogId?: string;
  categoryId: string;
  name: string;
  description: string;
  qty: number;
  /** Unit price exactly as entered. `priceIncludesVat` records its basis, so switching the
   *  quote's display mode converts on the fly and never accumulates rounding drift. */
  unitPrice: number;
  priceIncludesVat: boolean;
}

export type DiscountType = 'none' | 'percent' | 'amount';

export interface Discount {
  type: DiscountType;
  value: number;
  /** Basis of a fixed-amount discount (same idea as LineItem.priceIncludesVat). */
  includesVat: boolean;
}

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'declined';

export interface Customer {
  /** Bold line in the "עבור" box, e.g. "יום הולדת לנועה". */
  name: string;
  /** Secondary line, e.g. "אירוע בפארק הגלישה". */
  details: string;
  phone: string;
  email: string;
}

export interface Quote {
  id: string;
  number: string;
  status: QuoteStatus;
  /** ISO date (YYYY-MM-DD), local time. */
  issueDate: string;
  validDays: number;
  /** ISO date or empty. */
  eventDate: string;
  customer: Customer;
  items: LineItem[];
  /** Display mode: line prices shown including VAT (VAT extracted from the total) or excluding VAT (VAT added). */
  pricesIncludeVat: boolean;
  /** VAT rate in percent, captured when the quote is created so later rate changes don't alter it silently. */
  vatRate: number;
  discount: Discount;
  /** Quote-specific notes; one bullet per line, shown after the standard terms. */
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  vatRate: number;
  defaultValidDays: number;
  numberPrefix: string;
  nextNumber: number;
  /** Year the running number belongs to; numbering restarts at 1 each year. */
  numberYear: number;
  defaultPricesIncludeVat: boolean;
  catalogPricesIncludeVat: boolean;
  defaultNotes: string;
  lastBackupAt: string | null;
}

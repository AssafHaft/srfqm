import type { Catalog, Settings } from './types';

export const OTHER_CATEGORY_ID = 'other';

export const DEFAULT_SETTINGS: Settings = {
  vatRate: 18,
  defaultValidDays: 7,
  numberPrefix: 'Q',
  nextNumber: 1,
  numberYear: new Date().getFullYear(),
  defaultPricesIncludeVat: true,
  catalogPricesIncludeVat: true,
  defaultNotes: '',
  lastBackupAt: null,
};

/** Categories only — the price list itself is never shipped with the site. */
export const DEFAULT_CATALOG: Catalog = {
  categories: [
    { id: 'events', name: 'אירועים ופעילויות' },
    { id: 'equipment', name: 'ציוד' },
    { id: 'food', name: 'מזון ומשקאות' },
    { id: 'facilities', name: 'מתקנים' },
    { id: OTHER_CATEGORY_ID, name: 'שונות' },
  ],
  items: [],
};

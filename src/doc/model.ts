import { DOC_LABELS, standardTerms } from '../brand/brand';
import { addDays, formatDate, formatDateShort } from '../lib/dates';
import { groupItems } from '../lib/items';
import { formatILS, formatPercent, formatQty } from '../lib/money';
import { computeTotals, type Totals } from '../lib/pricing';
import type { Category, Quote } from '../model/types';

export type DocRow =
  | { kind: 'category'; key: string; name: string }
  | {
      kind: 'item';
      key: string;
      index: number;
      name: string;
      description: string;
      qty: string;
      unit: string;
      total: string;
      shaded: boolean;
    };

export interface TotalsRow {
  key: string;
  label: string;
  value: string;
  variant: 'plain' | 'shaded' | 'grand';
}

/** Everything the document renders, already formatted. */
export interface DocModel {
  number: string;
  issueDate: string;
  validUntil: string;
  customerTitle: string;
  customerLines: string[];
  rows: DocRow[];
  totalsRows: TotalsRow[];
  terms: string[];
  /** Used as the browser's default PDF file name. */
  fileTitle: string;
  totals: Totals;
}

export function buildDocModel(quote: Quote, categories: Category[]): DocModel {
  const totals = computeTotals(quote);
  const priced = new Map(quote.items.map((it, i) => [it.id, totals.lines[i]]));
  const groups = groupItems(quote.items, categories);
  const showCategories = groups.length > 1;

  const rows: DocRow[] = [];
  let index = 0;
  for (const group of groups) {
    if (showCategories) rows.push({ kind: 'category', key: `cat-${group.category.id}`, name: group.category.name });
    for (const item of group.items) {
      const p = priced.get(item.id)!;
      rows.push({
        kind: 'item',
        key: item.id,
        index: ++index,
        name: item.name,
        description: item.description,
        qty: formatQty(item.qty),
        unit: formatILS(p.unit),
        total: formatILS(p.total),
        shaded: index % 2 === 0,
      });
    }
  }

  const totalsRows: TotalsRow[] = [];
  if (totals.discount > 0) {
    const pct = quote.discount.type === 'percent' ? ` ${formatPercent(quote.discount.value)}` : '';
    totalsRows.push({ key: 'items', label: DOC_LABELS.beforeDiscount, value: formatILS(totals.itemsTotal), variant: 'plain' });
    totalsRows.push({ key: 'discount', label: `${DOC_LABELS.discount}${pct}`, value: formatILS(-totals.discount), variant: 'shaded' });
  }
  totalsRows.push({ key: 'net', label: DOC_LABELS.beforeVat, value: formatILS(totals.net), variant: 'plain' });
  totalsRows.push({ key: 'vat', label: `${DOC_LABELS.vat} ${formatPercent(quote.vatRate)}`, value: formatILS(totals.vat), variant: 'shaded' });
  totalsRows.push({ key: 'grand', label: DOC_LABELS.grandTotal, value: formatILS(totals.grandTotal), variant: 'grand' });

  const validUntil = formatDate(addDays(quote.issueDate, quote.validDays));
  const notes = quote.notes
    .split('\n')
    .map((l) => l.replace(/^\s*[-•*]\s*/, '').trim())
    .filter(Boolean);

  const c = quote.customer;
  const eventDate = formatDateShort(quote.eventDate);
  const customerTitle = [c.name.trim(), eventDate].filter(Boolean).join(' – ');
  const contact = [c.phone.trim(), c.email.trim()].filter(Boolean).join(' · ');

  const fileTitle = [DOC_LABELS.title, quote.number, c.name.trim()].filter(Boolean).join(' ').replace(/[\\/:*?"<>|]+/g, '');

  return {
    number: quote.number,
    issueDate: formatDate(quote.issueDate),
    validUntil,
    customerTitle,
    customerLines: [c.details.trim(), contact].filter(Boolean),
    rows,
    totalsRows,
    terms: [...standardTerms({ pricesIncludeVat: quote.pricesIncludeVat, validUntil }), ...notes],
    fileTitle,
    totals,
  };
}

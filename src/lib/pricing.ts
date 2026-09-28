import type { Discount, LineItem } from '../model/types';
import { roundHalfUp, toAgorot } from './money';

/** Converts a price between VAT bases at full precision (no intermediate rounding). */
export function convertPrice(price: number, fromIncludesVat: boolean, toIncludesVat: boolean, vatRate: number): number {
  if (fromIncludesVat === toIncludesVat) return price;
  return toIncludesVat ? (price * (100 + vatRate)) / 100 : (price * 100) / (100 + vatRate);
}

export interface PricedLine {
  /** Unit price in agorot, in the quote's display basis — exactly what the document shows. */
  unit: number;
  /** qty × unit, rounded to agorot, so every row's arithmetic checks out on paper. */
  total: number;
}

export interface Totals {
  lines: PricedLine[];
  /** Sum of line totals, in the display basis. */
  itemsTotal: number;
  /** Discount in agorot (positive number), in the display basis. */
  discount: number;
  /** Net amount (before VAT) after discount. */
  net: number;
  vat: number;
  /** Amount to pay, including VAT. */
  grandTotal: number;
}

export interface PricingInput {
  items: Pick<LineItem, 'qty' | 'unitPrice' | 'priceIncludesVat'>[];
  pricesIncludeVat: boolean;
  vatRate: number;
  discount: Discount;
}

export function priceLine(
  line: Pick<LineItem, 'qty' | 'unitPrice' | 'priceIncludesVat'>,
  pricesIncludeVat: boolean,
  vatRate: number,
): PricedLine {
  const unit = toAgorot(convertPrice(line.unitPrice, line.priceIncludesVat, pricesIncludeVat, vatRate));
  const qty = Number.isFinite(line.qty) ? line.qty : 0;
  return { unit, total: roundHalfUp(qty * unit) };
}

export function discountAmount(itemsTotal: number, discount: Discount, pricesIncludeVat: boolean, vatRate: number): number {
  let amount = 0;
  if (discount.type === 'percent') {
    amount = roundHalfUp((itemsTotal * discount.value) / 100);
  } else if (discount.type === 'amount') {
    amount = toAgorot(convertPrice(discount.value, discount.includesVat, pricesIncludeVat, vatRate));
  }
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.min(amount, Math.max(itemsTotal, 0));
}

/**
 * Prices shown with VAT: the total is what the customer pays; VAT is extracted from it
 * (matches the sample: 3,403.70 → 2,884.49 + 519.21 at 18%).
 * Prices shown without VAT: VAT is added on top of the net amount.
 */
export function computeTotals(input: PricingInput): Totals {
  const { pricesIncludeVat, vatRate } = input;
  const lines = input.items.map((line) => priceLine(line, pricesIncludeVat, vatRate));
  const itemsTotal = lines.reduce((sum, l) => sum + l.total, 0);
  const discount = discountAmount(itemsTotal, input.discount, pricesIncludeVat, vatRate);
  const afterDiscount = itemsTotal - discount;

  if (pricesIncludeVat) {
    const net = roundHalfUp((afterDiscount * 100) / (100 + vatRate));
    return { lines, itemsTotal, discount, net, vat: afterDiscount - net, grandTotal: afterDiscount };
  }
  const vat = roundHalfUp((afterDiscount * vatRate) / 100);
  return { lines, itemsTotal, discount, net: afterDiscount, vat, grandTotal: afterDiscount + vat };
}

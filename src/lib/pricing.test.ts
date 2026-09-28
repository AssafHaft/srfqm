import { describe, expect, it } from 'vitest';
import type { Discount } from '../model/types';
import { computeTotals, convertPrice, priceLine } from './pricing';
import { formatILS, parseNumber, roundHalfUp } from './money';

const noDiscount: Discount = { type: 'none', value: 0, includesVat: true };

/** The three lines of the sample quote (Q-2026-0927), prices including VAT. */
const sampleItems = [
  { qty: 1, unitPrice: 1121.9, priceIncludesVat: true },
  { qty: 34, unitPrice: 37.7, priceIncludesVat: true },
  { qty: 1, unitPrice: 1000, priceIncludesVat: true },
];

describe('computeTotals', () => {
  it('reproduces the sample quote exactly (prices include VAT)', () => {
    const t = computeTotals({ items: sampleItems, pricesIncludeVat: true, vatRate: 18, discount: noDiscount });
    expect(t.lines.map((l) => formatILS(l.total))).toEqual(['₪1,121.90', '₪1,281.80', '₪1,000.00']);
    expect(formatILS(t.net)).toBe('₪2,884.49');
    expect(formatILS(t.vat)).toBe('₪519.21');
    expect(formatILS(t.grandTotal)).toBe('₪3,403.70');
  });

  it('adds VAT on top when prices exclude VAT', () => {
    const t = computeTotals({
      items: [{ qty: 2, unitPrice: 100, priceIncludesVat: false }],
      pricesIncludeVat: false,
      vatRate: 18,
      discount: noDiscount,
    });
    expect(t).toMatchObject({ itemsTotal: 20000, net: 20000, vat: 3600, grandTotal: 23600 });
  });

  it('converts lines entered in the other basis without drift', () => {
    const line = { qty: 1, unitPrice: 120, priceIncludesVat: true };
    expect(priceLine(line, false, 18).unit).toBe(10169);
    expect(priceLine(line, true, 18).unit).toBe(12000);
    const back = convertPrice(convertPrice(120, true, false, 18), false, true, 18);
    expect(roundHalfUp(back * 100)).toBe(12000);
  });

  it('applies a percentage discount before VAT is split out', () => {
    const t = computeTotals({
      items: [{ qty: 1, unitPrice: 1180, priceIncludesVat: true }],
      pricesIncludeVat: true,
      vatRate: 18,
      discount: { type: 'percent', value: 10, includesVat: true },
    });
    expect(t).toMatchObject({ itemsTotal: 118000, discount: 11800, grandTotal: 106200, net: 90000, vat: 16200 });
  });

  it('applies a fixed discount in its own basis and never below zero', () => {
    const net = computeTotals({
      items: [{ qty: 1, unitPrice: 1000, priceIncludesVat: false }],
      pricesIncludeVat: false,
      vatRate: 18,
      discount: { type: 'amount', value: 118, includesVat: true },
    });
    expect(net).toMatchObject({ discount: 10000, net: 90000, vat: 16200, grandTotal: 106200 });

    const capped = computeTotals({
      items: [{ qty: 1, unitPrice: 50, priceIncludesVat: true }],
      pricesIncludeVat: true,
      vatRate: 18,
      discount: { type: 'amount', value: 500, includesVat: true },
    });
    expect(capped.grandTotal).toBe(0);
  });

  it('handles fractional quantities and a zero VAT rate', () => {
    const t = computeTotals({
      items: [{ qty: 1.5, unitPrice: 33.33, priceIncludesVat: false }],
      pricesIncludeVat: false,
      vatRate: 0,
      discount: noDiscount,
    });
    expect(t.lines[0].total).toBe(5000);
    expect(t.vat).toBe(0);
    expect(t.grandTotal).toBe(5000);
  });
});

describe('money helpers', () => {
  it('formats negative amounts and parses user input', () => {
    expect(formatILS(-20000)).toBe('-₪200.00');
    expect(parseNumber('1,234.50')).toBe(1234.5);
    expect(parseNumber('₪ 99')).toBe(99);
    expect(parseNumber('abc')).toBeNaN();
    expect(roundHalfUp(1.005 * 100)).toBe(101);
  });
});

/** Money is handled in integer agorot (1/100 ₪) to avoid floating-point drift. */

/** Rounds half away from zero after trimming float noise (e.g. 1.005 * 100 = 100.49999…). */
export function roundHalfUp(n: number): number {
  const clean = Number(n.toPrecision(12));
  return Math.sign(clean) * Math.round(Math.abs(clean));
}

export function toAgorot(shekels: number): number {
  return roundHalfUp(shekels * 100);
}

const amountFormat = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "₪1,121.90" — the symbol precedes the digits, as in the sample quote. Render inside an LTR-isolated element. */
export function formatILS(agorot: number): string {
  const sign = agorot < 0 ? '-' : '';
  return `${sign}₪${amountFormat.format(Math.abs(agorot) / 100)}`;
}

const qtyFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });

export function formatQty(qty: number): string {
  return qtyFormat.format(qty);
}

const percentFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

export function formatPercent(value: number): string {
  return `${percentFormat.format(value)}%`;
}

/** Parses user input such as "1,234.5" or "1234.50". Returns NaN for anything else. */
export function parseNumber(input: string): number {
  const cleaned = input.replace(/[,\s₪%]/g, '');
  if (cleaned === '' || !/^-?\d*\.?\d*$/.test(cleaned)) return NaN;
  return Number(cleaned);
}

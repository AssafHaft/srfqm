import { describe, expect, it } from 'vitest';
import { paginate, type Measured } from './paginate';

const g = { firstTop: 76, contTop: 64, bottom: 1060 };
const rows = (n: number, h = 67) => Array.from({ length: n }, () => ({ h, keepWithNext: false }));
const base: Omit<Measured, 'rows'> = { head: 315, thead: 39, totals: 145, terms: 190, sign: 75 };

describe('paginate', () => {
  it('keeps a short quote on one page', () => {
    const pages = paginate({ ...base, rows: rows(3) }, g);
    expect(pages).toEqual([{ head: true, rows: [0, 1, 2], totals: true, terms: true, sign: true }]);
  });

  it('flows long tables onto continuation pages and ends with the trailing blocks', () => {
    const pages = paginate({ ...base, rows: rows(30) }, g);
    expect(pages.length).toBeGreaterThan(2);
    expect(pages.flatMap((p) => p.rows)).toEqual(Array.from({ length: 30 }, (_, i) => i));
    const last = pages[pages.length - 1];
    expect(last.sign).toBe(true);
    for (const p of pages) {
      const top = p.head ? g.firstTop + base.head : g.contTop;
      const used =
        top +
        (p.rows.length ? base.thead + p.rows.length * 67 : 0) +
        (p.totals ? base.totals : 0) +
        (p.terms ? base.terms : 0) +
        (p.sign ? base.sign : 0);
      expect(used).toBeLessThanOrEqual(g.bottom);
    }
  });

  it('never leaves the totals alone at the top of a page', () => {
    // 8 rows fill page 1 so exactly that the totals no longer fit.
    const pages = paginate({ ...base, rows: rows(8, 70) }, g);
    const withTotals = pages.find((p) => p.totals)!;
    expect(withTotals.rows.length).toBeGreaterThan(0);
  });

  it('keeps a category heading with its first item', () => {
    const r = rows(12);
    r[9] = { h: 30, keepWithNext: true };
    const pages = paginate({ ...base, rows: r }, g);
    const pageOf = (i: number) => pages.findIndex((p) => p.rows.includes(i));
    expect(pageOf(9)).toBe(pageOf(10));
  });
});

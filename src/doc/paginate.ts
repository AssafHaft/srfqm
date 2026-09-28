/** Splits the document into A4 pages from measured block heights (CSS px). Pure, so it is unit-tested. */

export interface MeasuredRow {
  h: number;
  /** Category headings stay with the item that follows them. */
  keepWithNext: boolean;
}

export interface Measured {
  head: number;
  thead: number;
  rows: MeasuredRow[];
  totals: number;
  terms: number;
  sign: number;
}

export interface PageGeometry {
  /** Where content starts on the first page. */
  firstTop: number;
  /** Where content starts on continuation pages. */
  contTop: number;
  /** Content must end above this line (the footer sits below it). */
  bottom: number;
}

export interface PagePlan {
  head: boolean;
  /** Indices into Measured.rows. The table header is repeated on any page that has rows. */
  rows: number[];
  totals: boolean;
  terms: boolean;
  sign: boolean;
}

type Trailing = 'totals' | 'terms' | 'sign';
const TRAILING: Trailing[] = ['totals', 'terms', 'sign'];

export function paginate(m: Measured, g: PageGeometry): PagePlan[] {
  const blank = (head: boolean): PagePlan => ({ head, rows: [], totals: false, terms: false, sign: false });
  const pages: PagePlan[] = [blank(true)];
  let page = pages[0];
  let y = g.firstTop + m.head;

  const openPage = () => {
    page = blank(false);
    pages.push(page);
    y = g.contTop;
  };
  const isEmpty = (p: PagePlan) => !p.head && p.rows.length === 0 && !p.totals && !p.terms && !p.sign;
  const rowsHeight = (idx: number[]) => idx.reduce((s, i) => s + m.rows[i].h, 0);

  m.rows.forEach((row, i) => {
    const next = m.rows[i + 1];
    const need = row.h + (row.keepWithNext && next ? next.h : 0);
    if (page.rows.length > 0 && y + need > g.bottom) openPage();
    if (page.rows.length === 0) y += m.thead;
    page.rows.push(i);
    y += row.h;
  });

  for (const key of TRAILING) {
    const h = m[key];
    if (y + h > g.bottom && !isEmpty(page)) {
      // Never leave the totals alone on a page: carry the last item (and its heading) along.
      const moved: number[] = [];
      if (key === 'totals') {
        const keep = page.rows.slice();
        moved.unshift(keep.pop()!);
        while (keep.length > 0 && m.rows[keep[keep.length - 1]].keepWithNext) moved.unshift(keep.pop()!);
        if (keep.length === 0) moved.length = 0;
        else page.rows = keep;
      }
      openPage();
      if (moved.length > 0) {
        page.rows = moved;
        y += m.thead + rowsHeight(moved);
      }
    }
    page[key] = true;
    y += h;
  }
  return pages;
}

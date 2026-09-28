/**
 * A4 page geometry in CSS px (96 dpi), measured from the approved sample quote.
 * Shared by the stylesheet (via inline styles) and the paginator so both always agree.
 */
export const PAGE = {
  /** Content top on page 1 (top of the logo). */
  firstTop: 76,
  /** Content top on continuation pages (below the running header). */
  contTop: 70,
  /** Footer rule position; content must end above FOOTER_TOP - FOOTER_GAP. */
  footerTop: 1075,
  footerGap: 14,
  /** Safety margin against sub-pixel differences between screen and print layout. */
  slack: 2,
} as const;

export const PAGE_WIDTH_PX = 793.7;
export const PAGE_HEIGHT_PX = 1122.5;

export const pageGeometry = {
  firstTop: PAGE.firstTop,
  contTop: PAGE.contTop,
  bottom: PAGE.footerTop - PAGE.footerGap - PAGE.slack,
};

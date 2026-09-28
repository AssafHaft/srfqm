/**
 * LOCKED BRAND CONFIGURATION
 *
 * Everything that must look the same on every quote lives here and in `src/styles/document.css`:
 * company details, document labels, standard terms, signature lines and footer.
 * None of it is editable from the app — changing it requires a code change (commit + deploy).
 *
 * The repository is public, so this file must contain only information that already appears
 * on every quote sent to customers. Never put prices, costs or customer data here.
 */

export const BRAND = {
  companyName: 'יש גלים תל אביב בע"מ',
  companyIdLabel: 'ח.פ.',
  companyId: '515494813',
  address: 'איתן לבני 30, תל אביב',
  website: 'srfparktlv.co.il',
  logoAlt: 'SRF PARK TLV',
} as const;

export const DOC_LABELS = {
  title: 'הצעת מחיר',
  quoteNumber: "מס' הצעה",
  issueDate: 'תאריך',
  validUntil: 'בתוקף עד',
  from: 'מאת',
  to: 'עבור',
  colIndex: '#',
  colItem: 'פריט',
  colQty: 'כמות',
  colUnitPrice: 'מחיר ליחידה',
  colTotal: 'סה"כ',
  beforeDiscount: 'סה"כ לפני הנחה',
  discount: 'הנחה',
  beforeVat: 'סה"כ לפני מע"מ',
  vat: 'מע"מ',
  grandTotal: 'סה"כ לתשלום',
  terms: 'תנאים והערות',
  signatureCompany: `חתימה וחותמת – ${BRAND.companyName}`,
  signatureCustomer: 'אישור הלקוח – שם, חתימה ותאריך',
  page: 'עמוד',
  pageOf: 'מתוך',
} as const;

export const FOOTER_TEXT = [
  BRAND.companyName,
  `${BRAND.companyIdLabel} ${BRAND.companyId}`,
  BRAND.address,
  BRAND.website,
].join(' · ');

export interface TermsContext {
  pricesIncludeVat: boolean;
  /** Formatted DD.MM.YYYY. */
  validUntil: string;
}

/** Standard terms printed on every quote, before the quote-specific notes. */
export function standardTerms(ctx: TermsContext): string[] {
  return [
    ctx.pricesIncludeVat
      ? 'כל המחירים בש"ח וכוללים מע"מ כחוק.'
      : 'כל המחירים בש"ח ואינם כוללים מע"מ. מע"מ יתווסף כחוק.',
    `ההצעה בתוקף עד ${ctx.validUntil}.`,
  ];
}

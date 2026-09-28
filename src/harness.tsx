/** Dev-only page used by scripts/render-pdf.mjs to render a quote fixture straight to PDF. Not part of the production build. */
import { render } from 'preact';
import { useMemo, useState, useEffect } from 'preact/hooks';
import './styles/document.css';
import './styles/print.css';
import { loadDocumentFonts } from './fonts';
import { buildDocModel } from './doc/model';
import { Pages, usePagination } from './doc/QuoteDocument';
import { DEFAULT_CATALOG } from './model/defaults';
import { normalizeQuote } from './model/normalize';
import demo from '../fixtures/demo-quote.json';

declare global {
  interface Window {
    __FIXTURE__?: unknown;
    __READY__?: boolean;
    __PAGES__?: number;
  }
}

const quote = normalizeQuote(window.__FIXTURE__ ?? demo)!;

function Harness() {
  const [rev, setRev] = useState(0);
  const model = useMemo(() => buildDocModel(quote, DEFAULT_CATALOG.categories), []);
  const { plan, measure } = usePagination(model, rev);
  useEffect(() => {
    void loadDocumentFonts().then(() => setRev(1));
  }, []);
  useEffect(() => {
    if (rev === 1) {
      window.__PAGES__ = plan.length;
      requestAnimationFrame(() => (window.__READY__ = true));
    }
  }, [rev, plan]);
  document.title = model.fileTitle;
  return (
    <>
      {measure}
      <Pages model={model} plan={plan} />
    </>
  );
}

const style = document.createElement('style');
style.textContent = '@media screen { #print-root { display: block } body { background: #ccc } .qd-page { margin: 0 auto 12px } }';
document.head.appendChild(style);
render(<Harness />, document.getElementById('print-root')!);

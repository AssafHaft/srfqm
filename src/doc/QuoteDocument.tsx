import type { ComponentChildren } from 'preact';
import { createPortal } from 'preact/compat';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { BRAND, DOC_LABELS, FOOTER_TEXT } from '../brand/brand';
import logoUrl from '../brand/logo.svg';
import type { DocModel, DocRow, TotalsRow } from './model';
import { PAGE, pageGeometry } from './geometry';
import { paginate, type PagePlan } from './paginate';

/*
 * The quote document. Its structure, section order and styling are locked; only the DocModel
 * (quote content) varies. The same page elements are used for the on-screen preview and for
 * printing, so the PDF is exactly what the preview shows.
 */

const Ltr = ({ children }: { children: ComponentChildren }) => (
  <bdi class="qd-ltr" dir="ltr">
    {children}
  </bdi>
);

function Head({ m }: { m: DocModel }) {
  return (
    <div class="qd-block qd-head" data-m="head">
      <div class="qd-masthead">
        <img class="qd-logo" src={logoUrl} alt={BRAND.logoAlt} />
        <div class="qd-titles">
          <div class="qd-title">{DOC_LABELS.title}</div>
          <div class="qd-meta">
            <span class="qd-meta__label">{DOC_LABELS.quoteNumber}:</span> <Ltr>{m.number}</Ltr>
          </div>
          <div class="qd-meta">
            <span class="qd-meta__label">{DOC_LABELS.issueDate}:</span> <Ltr>{m.issueDate}</Ltr>
          </div>
          <div class="qd-meta">
            <span class="qd-meta__label">{DOC_LABELS.validUntil}:</span> <Ltr>{m.validUntil}</Ltr>
          </div>
        </div>
      </div>
      <div class="qd-parties">
        <div class="qd-party">
          <div class="qd-party__label">{DOC_LABELS.from}</div>
          <div class="qd-party__name">{BRAND.companyName}</div>
          <div class="qd-party__line">
            {BRAND.companyIdLabel} <Ltr>{BRAND.companyId}</Ltr>
          </div>
          <div class="qd-party__line">{BRAND.address}</div>
        </div>
        <div class="qd-party">
          <div class="qd-party__label">{DOC_LABELS.to}</div>
          <div class="qd-party__name">{m.customerTitle}</div>
          {m.customerLines.map((line) => (
            <div class="qd-party__line" key={line}>
              {line}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TableHead() {
  return (
    <div class="qd-block qd-grid qd-thead" data-m="thead">
      <div class="qd-cell qd-cell--index">{DOC_LABELS.colIndex}</div>
      <div class="qd-cell qd-cell--item">{DOC_LABELS.colItem}</div>
      <div class="qd-cell qd-cell--num">{DOC_LABELS.colQty}</div>
      <div class="qd-cell qd-cell--num">{DOC_LABELS.colUnitPrice}</div>
      <div class="qd-cell qd-cell--num">{DOC_LABELS.colTotal}</div>
    </div>
  );
}

function Row({ row }: { row: DocRow }) {
  if (row.kind === 'category') {
    return (
      <div class="qd-block qd-category" data-m="row" data-kind="category">
        {row.name}
      </div>
    );
  }
  return (
    <div class={`qd-block qd-grid qd-row${row.shaded ? ' qd-row--shaded' : ''}`} data-m="row" data-kind="item">
      <div class="qd-cell qd-cell--index">{row.index}</div>
      <div class="qd-cell qd-cell--item">
        <div class="qd-item__name">{row.name}</div>
        {row.description && <div class="qd-item__desc">{row.description}</div>}
      </div>
      <div class="qd-cell qd-cell--num">
        <Ltr>{row.qty}</Ltr>
      </div>
      <div class="qd-cell qd-cell--num">
        <Ltr>{row.unit}</Ltr>
      </div>
      <div class="qd-cell qd-cell--num">
        <Ltr>{row.total}</Ltr>
      </div>
    </div>
  );
}

function TotalsBlock({ rows }: { rows: TotalsRow[] }) {
  return (
    <div class="qd-block qd-totals-block" data-m="totals">
      <div class="qd-totals">
        {rows.map((r) => (
          <div class={`qd-totals__row qd-totals__row--${r.variant}`} key={r.key}>
            <div class="qd-totals__label">{r.label}</div>
            <div class="qd-totals__value">
              <Ltr>{r.value}</Ltr>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Terms({ terms }: { terms: string[] }) {
  return (
    <div class="qd-block qd-terms-block" data-m="terms">
      <div class="qd-terms">
        <div class="qd-terms__title">{DOC_LABELS.terms}</div>
        <ul class="qd-terms__list">
          {terms.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Signatures() {
  return (
    <div class="qd-block qd-sign-block" data-m="sign">
      <div class="qd-signatures">
        <div class="qd-signature">{DOC_LABELS.signatureCompany}</div>
        <div class="qd-signature">{DOC_LABELS.signatureCustomer}</div>
      </div>
    </div>
  );
}

function Page({ m, plan, index, count }: { m: DocModel; plan: PagePlan; index: number; count: number }) {
  return (
    <section class="qd-page">
      <div class="qd-topbar" />
      {!plan.head && (
        <div class="qd-running">
          {DOC_LABELS.title} <Ltr>{m.number}</Ltr>
          {m.customerTitle && <> · {m.customerTitle}</>}
        </div>
      )}
      <div class="qd-content" style={{ paddingTop: `${plan.head ? PAGE.firstTop : PAGE.contTop}px` }}>
        {plan.head && <Head m={m} />}
        {plan.rows.length > 0 && <TableHead />}
        {plan.rows.map((i) => (
          <Row row={m.rows[i]} key={m.rows[i].key} />
        ))}
        {plan.totals && <TotalsBlock rows={m.totalsRows} />}
        {plan.terms && <Terms terms={m.terms} />}
        {plan.sign && <Signatures />}
      </div>
      <footer class="qd-footer" style={{ top: `${PAGE.footerTop}px` }}>
        <div class="qd-footer__text">{FOOTER_TEXT}</div>
        {count > 1 && (
          <div class="qd-footer__page">
            {DOC_LABELS.page} {index + 1} {DOC_LABELS.pageOf} {count}
          </div>
        )}
      </footer>
    </section>
  );
}

export function Pages({ model, plan }: { model: DocModel; plan: PagePlan[] }) {
  return (
    <div class="qd" dir="rtl" lang="he">
      {plan.map((p, i) => (
        <Page m={model} plan={p} index={i} count={plan.length} key={i} />
      ))}
    </div>
  );
}

let measureHost: HTMLElement | null = null;
function getMeasureHost(): HTMLElement {
  if (!measureHost) {
    measureHost = document.createElement('div');
    measureHost.id = 'measure-host';
    measureHost.setAttribute('aria-hidden', 'true');
    document.body.appendChild(measureHost);
  }
  return measureHost;
}

/**
 * Renders every block once, off-screen, measures the heights and splits them into pages.
 * `revision` forces a re-measure (e.g. once web fonts finish loading).
 */
export function usePagination(model: DocModel, revision: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [plan, setPlan] = useState<PagePlan[]>([{ head: true, rows: [], totals: true, terms: true, sign: true }]);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const height = (el: Element | null) => (el ? el.getBoundingClientRect().height : 0);
    const rows = Array.from(root.querySelectorAll<HTMLElement>('[data-m="row"]')).map((el) => ({
      h: height(el),
      keepWithNext: el.dataset.kind === 'category',
    }));
    setPlan(
      paginate(
        {
          head: height(root.querySelector('[data-m="head"]')),
          thead: height(root.querySelector('[data-m="thead"]')),
          rows,
          totals: height(root.querySelector('[data-m="totals"]')),
          terms: height(root.querySelector('[data-m="terms"]')),
          sign: height(root.querySelector('[data-m="sign"]')),
        },
        pageGeometry,
      ),
    );
  }, [model, revision]);

  const measure = createPortal(
    <div class="qd qd--measure" dir="rtl" lang="he">
      <div class="qd-content" ref={ref}>
        <Head m={model} />
        <TableHead />
        {model.rows.map((r) => (
          <Row row={r} key={r.key} />
        ))}
        <TotalsBlock rows={model.totalsRows} />
        <Terms terms={model.terms} />
        <Signatures />
      </div>
    </div>,
    getMeasureHost(),
  );

  return { plan, measure };
}

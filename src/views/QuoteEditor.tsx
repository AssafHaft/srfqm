import type { ComponentChildren } from 'preact';
import { createPortal } from 'preact/compat';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { standardTerms } from '../brand/brand';
import { Icon } from '../components/icons';
import { AutoTextArea, Field, NumberField, NumberInput, Segmented, SelectField, TextField } from '../components/inputs';
import { Modal } from '../components/Modal';
import { PackagePicker, SavePackageModal } from './PackageModals';
import { toast } from '../components/toast';
import { buildDocModel, type DocModel } from '../doc/model';
import { PAGE_HEIGHT_PX, PAGE_WIDTH_PX } from '../doc/geometry';
import { Pages, usePagination } from '../doc/QuoteDocument';
import type { PagePlan } from '../doc/paginate';
import { fontsReady, fontsRevision } from '../fonts';
import { addDays, formatDate } from '../lib/dates';
import { newId } from '../lib/ids';
import { effectiveCategoryId, groupItems, moveItem, sortByCategory } from '../lib/items';
import { formatILS } from '../lib/money';
import { convertPrice, priceLine } from '../lib/pricing';
import { OTHER_CATEGORY_ID } from '../model/defaults';
import type { Category, DiscountType, LineItem, Quote, QuoteStatus } from '../model/types';
import { href } from '../router';
import { flushSaves } from '../store/db';
import {
  addCatalogItemToQuote,
  blankLine,
  catalog,
  discardIfPristine,
  getQuote,
  settings,
  updateQuote,
  upsertCatalogItem,
} from '../store/store';

export const STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: 'טיוטה',
  sent: 'נשלחה',
  accepted: 'אושרה',
  declined: 'לא אושרה',
};

type Update = (recipe: (q: Quote) => void) => void;

export function QuoteEditor({ id }: { id: string }) {
  const quote = getQuote(id);
  const categories = catalog.value.categories;
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [modal, setModal] = useState<null | 'catalog' | 'package' | 'save-package'>(null);
  const closeModal = useCallback(() => setModal(null), []);
  const update = useCallback<Update>((recipe) => updateQuote(id, recipe), [id]);
  useEffect(() => () => discardIfPristine(id), [id]);

  const model = useMemo(() => (quote ? buildDocModel(quote, categories) : null), [quote, categories]);

  if (!quote || !model) {
    return (
      <div class="empty-state">
        <p>ההצעה לא נמצאה במכשיר זה.</p>
        <a class="btn" href={href.quotes}>
          חזרה לרשימת ההצעות
        </a>
      </div>
    );
  }

  return (
    <div class={`editor editor--${tab}`}>
      <div class="editor__toolbar">
        <a class="icon-btn" href={href.quotes} aria-label="חזרה לרשימה">
          <Icon name="back" />
        </a>
        <div class="editor__heading">
          <div class="editor__number" dir="ltr">
            {quote.number}
          </div>
          <div class="editor__customer">{quote.customer.name || 'הצעה חדשה'}</div>
        </div>
        <div class="editor__tabs">
          <Segmented
            label="תצוגה"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'edit', label: 'עריכה' },
              { value: 'preview', label: 'תצוגה מקדימה' },
            ]}
          />
        </div>
        <ExportButton model={model} />
      </div>

      <div class="editor__body">
        <div class="editor__form">
          <CustomerSection quote={quote} update={update} />
          <ItemsSection
            quote={quote}
            categories={categories}
            update={update}
            onAddFromCatalog={() => setModal('catalog')}
            onAddPackage={() => setModal('package')}
            onSavePackage={() => setModal('save-package')}
          />
          <PricingSection quote={quote} update={update} model={model} />
          <NotesSection quote={quote} update={update} validUntil={model.validUntil} />
          <DetailsSection quote={quote} update={update} />
        </div>
        <div class="editor__preview">
          <Preview model={model} />
        </div>
      </div>

      {modal === 'catalog' && <CatalogPicker quoteId={quote.id} onClose={closeModal} />}
      {modal === 'package' && <PackagePicker quote={quote} onClose={closeModal} />}
      {modal === 'save-package' && <SavePackageModal quote={quote} onClose={closeModal} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preview + PDF export

function Preview({ model }: { model: DocModel }) {
  const { plan, measure } = usePagination(model, fontsRevision.value);
  return (
    <>
      {measure}
      <ScaledPages model={model} plan={plan} />
      {createPortal(<Pages model={model} plan={plan} />, document.getElementById('print-root')!)}
    </>
  );
}

const PAGE_GAP = 16;

function ScaledPages({ model, plan }: { model: DocModel; plan: PagePlan[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      if (w > 0) setScale(Math.min(1, w / PAGE_WIDTH_PX));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const height = plan.length * PAGE_HEIGHT_PX + (plan.length - 1) * PAGE_GAP;
  return (
    <div class="preview" ref={ref}>
      <div class="preview__frame" style={{ height: `${height * scale}px` }}>
        <div class="preview__pages" style={{ transform: `scale(${scale})`, width: `${PAGE_WIDTH_PX}px` }}>
          {fontsReady.value ? <Pages model={model} plan={plan} /> : <div class="preview__loading">טוען גופנים…</div>}
        </div>
      </div>
      {plan.length > 1 && <div class="preview__pages-count">{plan.length} עמודים</div>}
    </div>
  );
}

function ExportButton({ model }: { model: DocModel }) {
  const exportPdf = async () => {
    await flushSaves();
    await document.fonts?.ready;
    const previous = document.title;
    // Browsers use the document title as the default PDF file name.
    document.title = model.fileTitle;
    const restore = () => (document.title = previous);
    window.addEventListener('afterprint', restore, { once: true });
    toast('בחלון שנפתח בחרו "שמירה כ-PDF" (Save as PDF)');
    // Let the toast paint first: print() blocks rendering on desktop browsers.
    setTimeout(() => window.print(), 60);
  };
  return (
    <button type="button" class="btn btn--primary" onClick={exportPdf} disabled={!fontsReady.value}>
      <Icon name="pdf" />
      <span>שמירה כ-PDF</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Sections

function Section({ title, children, aside }: { title: string; children: ComponentChildren; aside?: ComponentChildren }) {
  return (
    <section class="card">
      <div class="card__head">
        <h2 class="card__title">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function CustomerSection({ quote, update }: { quote: Quote; update: Update }) {
  const c = quote.customer;
  const set = (key: keyof Quote['customer']) => (v: string) => update((q) => void (q.customer[key] = v));
  return (
    <Section title="לקוח ואירוע">
      <div class="grid-2">
        <TextField label="שם הלקוח / האירוע" value={c.name} onInput={set('name')} placeholder='לדוגמה: יום הולדת לנועה' hint="מודגש בתיבת 'עבור'" />
        <TextField
          label="תאריך האירוע"
          type="date"
          value={quote.eventDate}
          onInput={(v) => update((q) => void (q.eventDate = v))}
          hint="מתווסף לשם, למשל: – 08.10.26"
        />
        <TextField label="פרטים נוספים" value={c.details} onInput={set('details')} placeholder="לדוגמה: אירוע בפארק הגלישה" />
        <TextField label="טלפון" type="tel" dir="ltr" value={c.phone} onInput={set('phone')} />
        <TextField label="אימייל" type="email" dir="ltr" value={c.email} onInput={set('email')} />
      </div>
    </Section>
  );
}

function DetailsSection({ quote, update }: { quote: Quote; update: Update }) {
  return (
    <Section title="פרטי ההצעה">
      <div class="grid-2">
        <TextField label="מספר הצעה" dir="ltr" value={quote.number} onInput={(v) => update((q) => void (q.number = v))} />
        <SelectField
          label="סטטוס"
          value={quote.status}
          onChange={(v) => update((q) => void (q.status = v))}
          options={(Object.keys(STATUS_LABELS) as QuoteStatus[]).map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
        />
        <TextField label="תאריך ההצעה" type="date" value={quote.issueDate} onInput={(v) => v && update((q) => void (q.issueDate = v))} />
        <NumberField
          label="תוקף (ימים)"
          value={quote.validDays}
          decimals={0}
          onCommit={(n) => update((q) => void (q.validDays = n))}
          hint={`בתוקף עד ${formatDate(addDays(quote.issueDate, quote.validDays))}`}
        />
      </div>
    </Section>
  );
}

function ItemsSection({
  quote,
  categories,
  update,
  onAddFromCatalog,
  onAddPackage,
  onSavePackage,
}: {
  quote: Quote;
  categories: Category[];
  update: Update;
  onAddFromCatalog: () => void;
  onAddPackage: () => void;
  onSavePackage: () => void;
}) {
  const groups = groupItems(quote.items, categories);
  const sorted = sortByCategory(quote.items, categories);
  const [focusId, setFocusId] = useState<string | null>(null);

  const addCustom = () => {
    const last = sorted[sorted.length - 1];
    const line = blankLine(last ? effectiveCategoryId(last.categoryId, categories) : OTHER_CATEGORY_ID, quote.pricesIncludeVat);
    update((q) => void (q.items = sortByCategory([...q.items, line], categories)));
    setFocusId(line.id);
  };

  let index = 0;
  return (
    <Section title="פריטים" aside={<span class="card__meta">{quote.items.length} פריטים</span>}>
      {groups.length === 0 && <p class="muted">עדיין אין פריטים. אפשר להוסיף מהקטלוג או ליצור פריט חד-פעמי.</p>}
      {groups.map((g) => (
        <div class="item-group" key={g.category.id}>
          <div class="item-group__title">{g.category.name}</div>
          {g.items.map((item) => {
            const pos = sorted.indexOf(item);
            const prev = sorted[pos - 1];
            const next = sorted[pos + 1];
            const cat = (it?: LineItem) => it && effectiveCategoryId(it.categoryId, categories);
            return (
              <ItemCard
                key={item.id}
                n={++index}
                item={item}
                quote={quote}
                categories={categories}
                update={update}
                canUp={cat(prev) === cat(item)}
                canDown={cat(next) === cat(item)}
                autoFocus={focusId === item.id}
              />
            );
          })}
        </div>
      ))}
      <div class="btn-row">
        <button type="button" class="btn btn--primary-soft" onClick={onAddFromCatalog}>
          <Icon name="box" />
          הוספה מהקטלוג
        </button>
        <button type="button" class="btn btn--primary-soft" onClick={onAddPackage}>
          <Icon name="package" />
          הוספת חבילה
        </button>
        <button type="button" class="btn" onClick={addCustom}>
          <Icon name="plus" />
          פריט חד-פעמי
        </button>
        {quote.items.length > 0 && (
          <button type="button" class="btn btn--ghost" onClick={onSavePackage}>
            <Icon name="bookmark" />
            שמירת הפריטים כחבילה
          </button>
        )}
      </div>
    </Section>
  );
}

function ItemCard({
  n,
  item,
  quote,
  categories,
  update,
  canUp,
  canDown,
  autoFocus,
}: {
  n: number;
  item: LineItem;
  quote: Quote;
  categories: Category[];
  update: Update;
  canUp: boolean;
  canDown: boolean;
  autoFocus: boolean;
}) {
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) nameRef.current?.focus();
  }, [autoFocus]);
  const priced = priceLine(item, quote.pricesIncludeVat, quote.vatRate);
  const edit = (recipe: (it: LineItem) => void) =>
    update((q) => {
      const target = q.items.find((it) => it.id === item.id);
      if (target) recipe(target);
    });

  const saveToCatalog = () => {
    const catalogPrice = convertPrice(priced.unit / 100, quote.pricesIncludeVat, settings.value.catalogPricesIncludeVat, quote.vatRate);
    const entry = {
      id: newId(),
      categoryId: effectiveCategoryId(item.categoryId, categories),
      name: item.name.trim(),
      description: item.description.trim(),
      price: Math.round(catalogPrice * 100) / 100,
    };
    if (!entry.name) {
      toast('יש להזין שם לפריט לפני השמירה לקטלוג', 'error');
      return;
    }
    upsertCatalogItem(entry);
    edit((it) => void (it.catalogId = entry.id));
    toast(`"${entry.name}" נשמר בקטלוג`);
  };

  const vatNote = quote.pricesIncludeVat ? 'כולל מע"מ' : 'לפני מע"מ';
  return (
    <div class="item-card">
      <div class="item-card__index">{n}</div>
      <div class="item-card__main">
        <input
          ref={nameRef}
          class="input item-card__name"
          value={item.name}
          placeholder="שם הפריט"
          aria-label="שם הפריט"
          onInput={(e) => {
            const v = e.currentTarget.value;
            edit((it) => void (it.name = v));
          }}
        />
        <AutoTextArea
          class="item-card__desc"
          value={item.description}
          minRows={1}
          placeholder="תיאור (אופציונלי)"
          ariaLabel="תיאור הפריט"
          onInput={(v) => edit((it) => void (it.description = v))}
        />
        <div class="item-card__numbers">
          <Field label="כמות">
            <NumberInput ariaLabel="כמות" value={item.qty} decimals={3} onCommit={(v) => edit((it) => void (it.qty = v))} />
          </Field>
          <Field label={`מחיר ליחידה (${vatNote})`}>
            <NumberInput
              ariaLabel="מחיר ליחידה"
              prefix="₪"
              value={priced.unit / 100}
              onCommit={(v) =>
                edit((it) => {
                  it.unitPrice = v;
                  it.priceIncludesVat = quote.pricesIncludeVat;
                })
              }
            />
          </Field>
          <div class="item-card__total">
            <span class="field__label">סה"כ</span>
            <bdi dir="ltr">{formatILS(priced.total)}</bdi>
          </div>
        </div>
        <div class="item-card__actions">
          <select
            class="input select select--sm"
            aria-label="קטגוריה"
            value={effectiveCategoryId(item.categoryId, categories)}
            onChange={(e) => {
              const v = e.currentTarget.value;
              update((q) => {
                const target = q.items.find((it) => it.id === item.id);
                if (target) target.categoryId = v;
                q.items = sortByCategory(q.items, categories);
              });
            }}
          >
            {categories.map((c) => (
              <option value={c.id} key={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <span class="spacer" />
          {!item.catalogId && (
            <button type="button" class="icon-btn" title="שמירה לקטלוג" aria-label="שמירה לקטלוג" onClick={saveToCatalog}>
              <Icon name="bookmark" />
            </button>
          )}
          <button
            type="button"
            class="icon-btn"
            title="הזזה למעלה"
            aria-label="הזזה למעלה"
            disabled={!canUp}
            onClick={() => update((q) => void (q.items = moveItem(q.items, item.id, -1, categories)))}
          >
            <Icon name="up" />
          </button>
          <button
            type="button"
            class="icon-btn"
            title="הזזה למטה"
            aria-label="הזזה למטה"
            disabled={!canDown}
            onClick={() => update((q) => void (q.items = moveItem(q.items, item.id, 1, categories)))}
          >
            <Icon name="down" />
          </button>
          <button
            type="button"
            class="icon-btn icon-btn--danger"
            title="מחיקה"
            aria-label="מחיקת הפריט"
            onClick={() => update((q) => void (q.items = q.items.filter((it) => it.id !== item.id)))}
          >
            <Icon name="trash" />
          </button>
        </div>
      </div>
    </div>
  );
}

function PricingSection({ quote, update, model }: { quote: Quote; update: Update; model: DocModel }) {
  const currentRate = settings.value.vatRate;
  const d = quote.discount;
  return (
    <Section title='מחירים ומע"מ'>
      <Field label="הצגת המחירים בהצעה">
        <Segmented
          label="הצגת המחירים"
          value={quote.pricesIncludeVat ? 'incl' : 'excl'}
          onChange={(v) => update((q) => void (q.pricesIncludeVat = v === 'incl'))}
          options={[
            { value: 'incl', label: 'כולל מע"מ' },
            { value: 'excl', label: 'לפני מע"מ (מע"מ יתווסף)' },
          ]}
        />
      </Field>
      {quote.vatRate !== currentRate && (
        <div class="notice notice--warn">
          <Icon name="alert" />
          <span>
            ההצעה חושבה לפי מע"מ {quote.vatRate}%, והשיעור בהגדרות הוא {currentRate}%.
          </span>
          <button type="button" class="btn btn--sm" onClick={() => update((q) => void (q.vatRate = currentRate))}>
            עדכון ל-{currentRate}%
          </button>
        </div>
      )}
      <div class="grid-2">
        <Field label="הנחה">
          <Segmented<DiscountType>
            label="סוג הנחה"
            value={d.type}
            onChange={(v) => update((q) => void (q.discount = { ...q.discount, type: v, includesVat: q.pricesIncludeVat }))}
            options={[
              { value: 'none', label: 'ללא' },
              { value: 'percent', label: 'אחוז' },
              { value: 'amount', label: 'סכום' },
            ]}
          />
        </Field>
        {d.type !== 'none' && (
          <NumberField
            label={d.type === 'percent' ? 'אחוז הנחה' : `סכום ההנחה (${quote.pricesIncludeVat ? 'כולל' : 'לפני'} מע"מ)`}
            value={d.type === 'amount' ? convertPrice(d.value, d.includesVat, quote.pricesIncludeVat, quote.vatRate) : d.value}
            suffix={d.type === 'percent' ? '%' : undefined}
            prefix={d.type === 'amount' ? '₪' : undefined}
            onCommit={(v) =>
              update((q) => void (q.discount = { type: d.type, value: d.type === 'percent' ? Math.min(v, 100) : v, includesVat: q.pricesIncludeVat }))
            }
          />
        )}
      </div>
      <dl class="totals-summary">
        {model.totalsRows.map((r) => (
          <div class={`totals-summary__row totals-summary__row--${r.variant}`} key={r.key}>
            <dt>{r.label}</dt>
            <dd>
              <bdi dir="ltr">{r.value}</bdi>
            </dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

function NotesSection({ quote, update, validUntil }: { quote: Quote; update: Update; validUntil: string }) {
  const fixed = standardTerms({ pricesIncludeVat: quote.pricesIncludeVat, validUntil });
  return (
    <Section title="תנאים והערות">
      <div class="locked-terms">
        <div class="locked-terms__title">
          <Icon name="lock" size={16} />
          תנאים קבועים (נעולים)
        </div>
        <ul>
          {fixed.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
      <Field label="הערות להצעה זו" hint="כל שורה מופיעה כסעיף נפרד, אחרי התנאים הקבועים.">
        <AutoTextArea value={quote.notes} minRows={3} onInput={(v) => update((q) => void (q.notes = v))} ariaLabel="הערות להצעה זו" />
      </Field>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Catalog picker

function CatalogPicker({ quoteId, onClose }: { quoteId: string; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<string>('all');
  const { categories, items } = catalog.value;
  const quote = getQuote(quoteId);
  const q = query.trim().toLowerCase();
  const visible = items.filter(
    (i) =>
      (cat === 'all' || effectiveCategoryId(i.categoryId, categories) === cat) &&
      (!q || i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q)),
  );
  const includes = settings.value.catalogPricesIncludeVat;

  return (
    <Modal
      title="הוספה מהקטלוג"
      onClose={onClose}
      footer={
        <button type="button" class="btn btn--primary" onClick={onClose}>
          סיום
        </button>
      }
    >
      {items.length === 0 ? (
        <div class="empty-state empty-state--inline">
          <p>הקטלוג ריק. אפשר להוסיף פריטים בעמוד הקטלוג, לטעון קובץ מחירון, או לשמור פריט חד-פעמי לקטלוג.</p>
          <a class="btn" href={href.catalog} onClick={onClose}>
            לעמוד הקטלוג
          </a>
        </div>
      ) : (
        <>
          <div class="search">
            <Icon name="search" />
            <input class="input" type="search" placeholder="חיפוש פריט" value={query} onInput={(e) => setQuery(e.currentTarget.value)} autoFocus />
          </div>
          <div class="chips">
            {[{ id: 'all', name: 'הכול' }, ...categories].map((c) => (
              <button type="button" class={`chip${cat === c.id ? ' is-active' : ''}`} onClick={() => setCat(c.id)} key={c.id}>
                {c.name}
              </button>
            ))}
          </div>
          <ul class="picker-list">
            {visible.map((item) => {
              const inQuote = quote?.items.find((it) => it.catalogId === item.id);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    class="picker-item"
                    onClick={() => {
                      addCatalogItemToQuote(quoteId, item);
                      toast(inQuote ? `כמות "${item.name}" עודכנה` : `"${item.name}" נוסף להצעה`);
                    }}
                  >
                    <span class="picker-item__text">
                      <span class="picker-item__name">{item.name}</span>
                      {item.description && <span class="picker-item__desc">{item.description}</span>}
                    </span>
                    <span class="picker-item__price">
                      <bdi dir="ltr">{formatILS(Math.round(item.price * 100))}</bdi>
                      <small>{includes ? 'כולל מע"מ' : 'לפני מע"מ'}</small>
                    </span>
                    <span class={`picker-item__add${inQuote ? ' is-in' : ''}`}>{inQuote ? `×${inQuote.qty}` : <Icon name="plus" />}</span>
                  </button>
                </li>
              );
            })}
            {visible.length === 0 && <li class="muted">לא נמצאו פריטים.</li>}
          </ul>
        </>
      )}
    </Modal>
  );
}

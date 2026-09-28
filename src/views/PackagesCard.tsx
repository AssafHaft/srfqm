import { Icon } from '../components/icons';
import { NumberInput } from '../components/inputs';
import { formatILS } from '../lib/money';
import { packageTotal, resolvePackageItem } from '../lib/packages';
import { newId } from '../lib/ids';
import type { Package } from '../model/types';
import { catalog, catalogContext, deletePackage, settings, upsertPackage } from '../store/store';

/** Package management on the catalog page. */
export function PackagesCard() {
  const packages = catalog.value.packages;
  const addNew = () => upsertPackage({ id: newId(), name: 'חבילה חדשה', description: '', items: [] });
  return (
    <section class="card">
      <div class="card__head">
        <h2 class="card__title">
          <Icon name="package" size={18} /> חבילות
        </h2>
        <button type="button" class="btn btn--sm" onClick={addNew}>
          <Icon name="plus" size={16} />
          חבילה חדשה
        </button>
      </div>
      {packages.length === 0 ? (
        <p class="muted">
          חבילה מוסיפה להצעה כמה פריטים בלחיצה אחת (למשל מסיבת יום הולדת או אירוע חברה). הדרך המהירה ליצור חבילה: לבנות
          הצעה ולבחור "שמירת הפריטים כחבילה".
        </p>
      ) : (
        packages.map((pkg) => <PackageEditor pkg={pkg} key={pkg.id} />)
      )}
    </section>
  );
}

function PackageEditor({ pkg }: { pkg: Package }) {
  const ctx = catalogContext();
  const items = catalog.value.items;
  const set = (patch: Partial<Package>) => upsertPackage({ ...pkg, ...patch });
  const total = packageTotal(pkg, ctx, ctx.pricesIncludeVat, settings.value.vatRate);

  return (
    <details class="package">
      <summary class="package__summary">
        <span class="package__name">{pkg.name || 'ללא שם'}</span>
        <span class="package__meta">
          {pkg.items.length} פריטים · <bdi dir="ltr">{formatILS(total)}</bdi>
        </span>
      </summary>
      <div class="package__body">
        <div class="grid-2">
          <input class="input" aria-label="שם החבילה" value={pkg.name} onInput={(e) => set({ name: e.currentTarget.value })} />
          <input
            class="input"
            aria-label="תיאור החבילה"
            placeholder="תיאור קצר (אופציונלי)"
            value={pkg.description}
            onInput={(e) => set({ description: e.currentTarget.value })}
          />
        </div>
        <ul class="package__items">
          {pkg.items.map((pi, i) => {
            const line = resolvePackageItem(pi, ctx);
            return (
              <li key={i}>
                <span class="package__item-name">
                  {line.name || 'ללא שם'}
                  {!line.catalogId && <small> · חד-פעמי</small>}
                </span>
                <NumberInput
                  class="package__qty"
                  ariaLabel={`כמות: ${line.name}`}
                  value={pi.qty}
                  decimals={3}
                  onCommit={(qty) => set({ items: pkg.items.map((x, j) => (j === i ? { ...x, qty } : x)) })}
                />
                <button
                  type="button"
                  class="icon-btn icon-btn--danger"
                  aria-label={`הסרת ${line.name} מהחבילה`}
                  onClick={() => set({ items: pkg.items.filter((_, j) => j !== i) })}
                >
                  <Icon name="close" />
                </button>
              </li>
            );
          })}
        </ul>
        <div class="package__actions">
          <select
            class="input select select--sm"
            aria-label="הוספת פריט מהקטלוג לחבילה"
            value=""
            disabled={items.length === 0}
            onChange={(e) => {
              const c = items.find((x) => x.id === e.currentTarget.value);
              e.currentTarget.value = '';
              if (!c) return;
              set({
                items: [
                  ...pkg.items,
                  {
                    catalogId: c.id,
                    qty: 1,
                    categoryId: c.categoryId,
                    name: c.name,
                    description: c.description,
                    unitPrice: c.price,
                    priceIncludesVat: ctx.pricesIncludeVat,
                  },
                ],
              });
            }}
          >
            <option value="">+ הוספת פריט מהקטלוג…</option>
            {items.map((c) => (
              <option value={c.id} key={c.id}>
                {c.name || 'ללא שם'}
              </option>
            ))}
          </select>
          <span class="spacer" />
          <button
            type="button"
            class="btn btn--sm btn--ghost btn--danger"
            onClick={() => {
              if (confirm(`למחוק את החבילה "${pkg.name}"?`)) deletePackage(pkg.id);
            }}
          >
            <Icon name="trash" size={16} />
            מחיקת החבילה
          </button>
        </div>
      </div>
    </details>
  );
}

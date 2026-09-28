import { useState } from 'preact/hooks';
import { Icon } from '../components/icons';
import { Modal } from '../components/Modal';
import { toast } from '../components/toast';
import { formatILS } from '../lib/money';
import { packageTotal, resolvePackageItem } from '../lib/packages';
import type { Quote } from '../model/types';
import { href } from '../router';
import { addPackageToQuote, catalog, catalogContext, savePackageFromQuote } from '../store/store';

/** Lists saved packages; one click adds all of a package's items to the quote. */
export function PackagePicker({ quote, onClose }: { quote: Quote; onClose: () => void }) {
  const packages = catalog.value.packages;
  const ctx = catalogContext();
  const vatNote = quote.pricesIncludeVat ? 'כולל מע"מ' : 'לפני מע"מ';

  return (
    <Modal title="הוספת חבילה" onClose={onClose}>
      {packages.length === 0 ? (
        <div class="empty-state empty-state--inline">
          <p>
            עדיין אין חבילות. בנו הצעה עם הפריטים של החבילה ולחצו "שמירת הפריטים כחבילה", או צרו חבילה בעמוד הקטלוג.
          </p>
          <a class="btn" href={href.catalog} onClick={onClose}>
            לעמוד הקטלוג
          </a>
        </div>
      ) : (
        <ul class="picker-list">
          {packages.map((pkg) => {
            const names = pkg.items.map((pi) => resolvePackageItem(pi, ctx).name).filter(Boolean);
            return (
              <li key={pkg.id}>
                <button
                  type="button"
                  class="picker-item"
                  onClick={() => {
                    addPackageToQuote(quote.id, pkg);
                    toast(`החבילה "${pkg.name}" נוספה (${pkg.items.length} פריטים)`);
                    onClose();
                  }}
                >
                  <span class="picker-item__text">
                    <span class="picker-item__name">{pkg.name}</span>
                    <span class="picker-item__desc">{pkg.description || names.join(' · ')}</span>
                  </span>
                  <span class="picker-item__price">
                    <bdi dir="ltr">{formatILS(packageTotal(pkg, ctx, quote.pricesIncludeVat, quote.vatRate))}</bdi>
                    <small>
                      {pkg.items.length} פריטים · {vatNote}
                    </small>
                  </span>
                  <span class="picker-item__add">
                    <Icon name="plus" />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

export function SavePackageModal({ quote, onClose }: { quote: Quote; onClose: () => void }) {
  const [name, setName] = useState('');
  const save = () => {
    const pkg = savePackageFromQuote(quote.id, name);
    if (!pkg) return;
    toast(`החבילה "${pkg.name}" נשמרה`);
    onClose();
  };
  return (
    <Modal
      title="שמירת הפריטים כחבילה"
      onClose={onClose}
      footer={
        <button type="button" class="btn btn--primary" disabled={!name.trim()} onClick={save}>
          שמירה
        </button>
      }
    >
      <form
        class="field"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label class="field__label" for="package-name">
          שם החבילה
        </label>
        <input
          id="package-name"
          class="input"
          value={name}
          placeholder="לדוגמה: מסיבת יום הולדת"
          autoFocus
          onInput={(e) => setName(e.currentTarget.value)}
        />
        <div class="field__hint">
          החבילה תכלול את {quote.items.length} הפריטים שבהצעה עם הכמויות הנוכחיות. פריטים מהקטלוג יתעדכנו אוטומטית
          כשהמחיר בקטלוג משתנה; פריטים חד-פעמיים או שמחירם שונה בהצעה יישמרו כפי שהם.
        </div>
      </form>
    </Modal>
  );
}

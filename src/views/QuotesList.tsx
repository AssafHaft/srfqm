import { useState } from 'preact/hooks';
import { Icon } from '../components/icons';
import { cloudState } from '../cloud/cloud';
import { toast } from '../components/toast';
import { formatDate } from '../lib/dates';
import { formatILS } from '../lib/money';
import { computeTotals } from '../lib/pricing';
import { href, navigate } from '../router';
import { downloadJson } from '../store/backup';
import { createQuote, deleteQuote, duplicateQuote, exportData, quotes, settings } from '../store/store';
import { STATUS_LABELS } from './QuoteEditor';

const BACKUP_REMINDER_DAYS = 14;

export function backupFileName(kind: 'backup' | 'catalog'): string {
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return kind === 'backup' ? `srfqm-${stamp}.backup.json` : `srfqm-pricelist-${stamp}.backup.json`;
}

export function downloadBackup(): void {
  downloadJson(exportData('backup'), backupFileName('backup'));
  toast('קובץ הגיבוי נשמר');
}

function needsBackup(): boolean {
  if (quotes.value.length === 0) return false;
  // With cloud sync the quotes already live on the server as well.
  if (['synced', 'syncing', 'offline'].includes(cloudState.value)) return false;
  const last = settings.value.lastBackupAt;
  return !last || Date.now() - Date.parse(last) > BACKUP_REMINDER_DAYS * 86_400_000;
}

export function QuotesList() {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const list = quotes.value.filter(
    (x) => !q || x.number.toLowerCase().includes(q) || x.customer.name.toLowerCase().includes(q) || x.customer.phone.includes(q),
  );

  const onNew = () => navigate(href.quote(createQuote().id));

  return (
    <div class="page">
      <div class="page__head">
        <h1 class="page__title">הצעות מחיר</h1>
        <button type="button" class="btn btn--primary" onClick={onNew}>
          <Icon name="plus" />
          הצעה חדשה
        </button>
      </div>

      {(cloudState.value === 'signed-out' || cloudState.value === 'unverified' || cloudState.value === 'not-member') && (
        <div class="notice">
          <Icon name="cloud" />
          <span>כדי לראות כאן את ההצעות מכל המכשירים, התחברו לסנכרון.</span>
          <a class="btn btn--sm" href={href.settings}>
            להתחברות
          </a>
        </div>
      )}

      {needsBackup() && (
        <div class="notice">
          <Icon name="alert" />
          <span>הנתונים שמורים רק במכשיר הזה. מומלץ לשמור קובץ גיבוי מדי פעם.</span>
          <button type="button" class="btn btn--sm" onClick={downloadBackup}>
            גיבוי עכשיו
          </button>
        </div>
      )}

      {quotes.value.length > 0 && (
        <div class="search">
          <Icon name="search" />
          <input class="input" type="search" placeholder="חיפוש לפי שם, מספר או טלפון" value={query} onInput={(e) => setQuery(e.currentTarget.value)} />
        </div>
      )}

      {quotes.value.length === 0 ? (
        <div class="empty-state">
          <p>עדיין אין הצעות מחיר במכשיר זה.</p>
          <button type="button" class="btn btn--primary" onClick={onNew}>
            יצירת הצעה ראשונה
          </button>
        </div>
      ) : (
        <ul class="quote-list">
          {list.map((x) => {
            const total = computeTotals(x).grandTotal;
            return (
              <li class="quote-row" key={x.id}>
                <a class="quote-row__link" href={href.quote(x.id)}>
                  <span class="quote-row__top">
                    <bdi class="quote-row__number" dir="ltr">
                      {x.number}
                    </bdi>
                    <span class={`status status--${x.status}`}>{STATUS_LABELS[x.status]}</span>
                  </span>
                  <span class="quote-row__name">{x.customer.name || 'ללא שם'}</span>
                  <span class="quote-row__meta">
                    {x.eventDate && <>אירוע: {formatDate(x.eventDate)} · </>}
                    {x.items.length} פריטים · עודכנה {formatDate(x.updatedAt.slice(0, 10))}
                  </span>
                </a>
                <bdi class="quote-row__total" dir="ltr">
                  {formatILS(total)}
                </bdi>
                <div class="quote-row__actions">
                  <button
                    type="button"
                    class="icon-btn"
                    title="שכפול"
                    aria-label="שכפול ההצעה"
                    onClick={() => {
                      const copy = duplicateQuote(x.id);
                      if (copy) navigate(href.quote(copy.id));
                    }}
                  >
                    <Icon name="copy" />
                  </button>
                  <button
                    type="button"
                    class="icon-btn icon-btn--danger"
                    title="מחיקה"
                    aria-label="מחיקת ההצעה"
                    onClick={() => {
                      if (confirm(`למחוק את הצעה ${x.number}${x.customer.name ? ` (${x.customer.name})` : ''}?`)) deleteQuote(x.id);
                    }}
                  >
                    <Icon name="trash" />
                  </button>
                </div>
              </li>
            );
          })}
          {list.length === 0 && <li class="muted">לא נמצאו הצעות.</li>}
        </ul>
      )}
    </div>
  );
}

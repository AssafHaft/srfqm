import { useRef, useState } from 'preact/hooks';
import { Icon } from '../components/icons';
import { Modal } from '../components/Modal';
import { toast } from '../components/toast';
import { formatDate } from '../lib/dates';
import { catalogToXlsx, diffIsEmpty, xlsxToCatalog, type ImportResult } from '../lib/excel';
import { catalog, catalogSync, replaceCatalog, settings } from '../store/store';
import {
  catalogPassword,
  checkPublishedCatalog,
  GITHUB_ACTIONS_URL,
  GITHUB_TOKEN_URL,
  GITHUB_UPLOAD_URL,
  githubToken,
  markManuallyPublished,
  prepareManualPublish,
  PUBLISHED_FILE_NAME,
  PublishConflictError,
  PublishError,
  publishToGithub,
  REPO,
  setCatalogPassword,
  setGithubToken,
  testGithubToken,
} from '../store/sync';
import type { EncryptedFile } from '../lib/crypto';

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type Dialog = null | { kind: 'import'; result: ImportResult } | { kind: 'setup' } | { kind: 'manual'; file: EncryptedFile; blob: Blob };

/** Catalog page card: Excel export/import and publishing the catalog to every device. */
export function CatalogSyncCard() {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState<null | 'export' | 'import' | 'publish'>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const sync = catalogSync.value;
  const configured = !!catalogPassword.value;

  const exportExcel = async () => {
    setBusy('export');
    try {
      const blob = await catalogToXlsx(catalog.value, settings.value.catalogPricesIncludeVat);
      download(blob, `קטלוג ${formatDate(new Date().toISOString().slice(0, 10))}.xlsx`);
      toast('קובץ האקסל נשמר');
    } catch {
      toast('יצירת קובץ האקסל נכשלה.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const importExcel = async (file: File) => {
    setBusy('import');
    try {
      setDialog({ kind: 'import', result: await xlsxToCatalog(file, catalog.value) });
    } finally {
      setBusy(null);
    }
  };

  const publish = async (overwrite = false) => {
    if (!configured) {
      setDialog({ kind: 'setup' });
      return;
    }
    if (!githubToken.value) {
      const prepared = await prepareManualPublish();
      download(prepared.blob, PUBLISHED_FILE_NAME);
      setDialog({ kind: 'manual', ...prepared });
      return;
    }
    setBusy('publish');
    try {
      await publishToGithub(overwrite);
      toast('הקטלוג פורסם! כל המכשירים יקבלו אותו תוך כ-2 דקות.');
    } catch (err) {
      if (err instanceof PublishConflictError) {
        const ok = confirm(
          `באתר יש קטלוג שפורסם ב-${formatDateTime(err.remotePublishedAt)}, אחרי העדכון האחרון שהמכשיר הזה קיבל. לפרסם בכל זאת ולהחליף אותו?`,
        );
        if (ok) void publish(true);
      } else {
        toast(err instanceof PublishError ? err.message : 'הפרסום נכשל.', 'error');
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <section class="card sync-card">
      <div class="card__head">
        <h2 class="card__title">
          <Icon name="upload" size={18} /> עדכון הקטלוג בכל המכשירים
        </h2>
        <button type="button" class="btn btn--sm btn--ghost" onClick={() => setDialog({ kind: 'setup' })}>
          <Icon name="sliders" size={16} />
          הגדרות פרסום
        </button>
      </div>

      <div class={`sync-status${sync.dirty ? ' sync-status--dirty' : ''}`}>
        {sync.dirty
          ? 'יש שינויים בקטלוג שעדיין לא פורסמו לשאר המכשירים.'
          : sync.publishedAt
            ? `הקטלוג מעודכן. פורסם לאחרונה: ${formatDateTime(sync.publishedAt)}.`
            : 'הקטלוג עדיין לא פורסם.'}
      </div>

      <ol class="sync-steps">
        <li>
          <button type="button" class="btn" onClick={exportExcel} disabled={busy !== null}>
            <Icon name="pdf" />
            {busy === 'export' ? 'יוצר קובץ…' : 'ייצוא לאקסל'}
          </button>
          <span>מורידים את הקטלוג המלא לקובץ Excel ועורכים בו מוצרים, מחירים וקטגוריות.</span>
        </li>
        <li>
          <button type="button" class="btn" onClick={() => fileInput.current?.click()} disabled={busy !== null}>
            <Icon name="upload" />
            {busy === 'import' ? 'קורא קובץ…' : 'ייבוא מאקסל'}
          </button>
          <span>בוחרים את הקובץ השמור. לפני העדכון תוצג רשימת השינויים לאישור.</span>
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            hidden
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              e.currentTarget.value = '';
              if (f) void importExcel(f);
            }}
          />
        </li>
        <li>
          <button type="button" class="btn btn--primary" onClick={() => void publish()} disabled={busy !== null}>
            <Icon name="upload" />
            {busy === 'publish' ? 'מפרסם…' : 'פרסום לאתר'}
          </button>
          <span>שומרים את הקטלוג באתר (מוצפן בסיסמה). כל מכשיר שפותח את האפליקציה יקבל אותו אוטומטית.</span>
        </li>
      </ol>

      {dialog?.kind === 'import' && (
        <ImportPreview
          result={dialog.result}
          onClose={() => setDialog(null)}
          onApply={() => {
            replaceCatalog(dialog.result.catalog);
            setDialog(null);
            toast('הקטלוג עודכן. כדי שיופיע בכל המכשירים לחצו "פרסום לאתר".');
          }}
        />
      )}
      {dialog?.kind === 'setup' && <PublishSetup onClose={() => setDialog(null)} />}
      {dialog?.kind === 'manual' && (
        <ManualPublish
          blob={dialog.blob}
          onClose={() => setDialog(null)}
          onDone={() => {
            markManuallyPublished(dialog.file);
            setDialog(null);
            toast('מעולה! כל המכשירים יקבלו את הקטלוג תוך כ-2 דקות.');
          }}
        />
      )}
    </section>
  );
}

function DiffList({ title, items, tone }: { title: string; items: string[]; tone?: 'add' | 'remove' }) {
  if (items.length === 0) return null;
  return (
    <div class={`diff diff--${tone ?? 'change'}`}>
      <div class="diff__title">
        {title} ({items.length})
      </div>
      <ul>
        {items.slice(0, 30).map((t, i) => (
          <li key={i}>{t}</li>
        ))}
        {items.length > 30 && <li>ועוד {items.length - 30}…</li>}
      </ul>
    </div>
  );
}

function ImportPreview({ result, onClose, onApply }: { result: ImportResult; onClose: () => void; onApply: () => void }) {
  const { diff, errors } = result;
  const empty = diffIsEmpty(diff);
  return (
    <Modal
      title="ייבוא מאקסל – בדיקת השינויים"
      onClose={onClose}
      footer={
        <>
          <button type="button" class="btn" onClick={onClose}>
            ביטול
          </button>
          <button type="button" class="btn btn--primary" disabled={errors.length > 0 || empty} onClick={onApply}>
            עדכון הקטלוג
          </button>
        </>
      }
    >
      {errors.length > 0 ? (
        <div class="notice notice--warn">
          <Icon name="alert" />
          <span>
            <strong>יש לתקן את הקובץ ולייבא שוב:</strong>
            <ul class="error-list">
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </span>
        </div>
      ) : empty ? (
        <p class="muted">לא נמצאו שינויים לעומת הקטלוג הנוכחי.</p>
      ) : (
        <>
          <p class="muted">
            אחרי העדכון יהיו בקטלוג {result.catalog.items.length} מוצרים ב-{result.catalog.categories.length} קטגוריות.
          </p>
          <DiffList title="מוצרים חדשים" items={diff.addedItems} tone="add" />
          <DiffList title="מוצרים שעודכנו" items={diff.updatedItems} />
          <DiffList title="מוצרים שיימחקו" items={diff.removedItems} tone="remove" />
          <DiffList title="קטגוריות חדשות" items={diff.addedCategories} tone="add" />
          <DiffList title="קטגוריות ששמן שונה" items={diff.renamedCategories} />
          <DiffList title="קטגוריות שיימחקו" items={diff.removedCategories} tone="remove" />
        </>
      )}
    </Modal>
  );
}

function PublishSetup({ onClose }: { onClose: () => void }) {
  const [password, setPassword] = useState(catalogPassword.value);
  const [token, setToken] = useState(githubToken.value);
  const [showPassword, setShowPassword] = useState(false);
  const [testing, setTesting] = useState(false);
  const passwordChanged = !!catalogPassword.value && password !== catalogPassword.value;

  const save = () => {
    if (password.trim().length < 8) {
      toast('הסיסמה צריכה להכיל לפחות 8 תווים.', 'error');
      return;
    }
    setCatalogPassword(password.trim());
    setGithubToken(token);
    toast('ההגדרות נשמרו במכשיר זה');
    void checkPublishedCatalog(true);
    onClose();
  };

  const test = async () => {
    setTesting(true);
    const error = await testGithubToken(token.trim());
    setTesting(false);
    toast(error ?? 'החיבור ל-GitHub תקין ✓', error ? 'error' : 'info');
  };

  return (
    <Modal
      title="הגדרות פרסום הקטלוג"
      onClose={onClose}
      footer={
        <button type="button" class="btn btn--primary" onClick={save}>
          שמירה
        </button>
      }
    >
      <div class="setup">
        <section>
          <h3>1. סיסמת הקטלוג</h3>
          <p class="muted">
            הקטלוג נשמר באתר מוצפן, כדי שאף אחד מבחוץ לא יוכל לראות את המחירים. כל מכשיר (שלכם ושל העובדים) יבקש את
            הסיסמה פעם אחת בלבד. בחרו סיסמה של 10 תווים או יותר (למשל כמה מילים), ושמרו אותה במקום בטוח.
          </p>
          <div class="password-row">
            <input
              class="input"
              type={showPassword ? 'text' : 'password'}
              aria-label="סיסמת הקטלוג"
              autoComplete="new-password"
              value={password}
              onInput={(e) => setPassword(e.currentTarget.value)}
            />
            <button type="button" class="icon-btn" aria-label="הצגת הסיסמה" onClick={() => setShowPassword(!showPassword)}>
              <Icon name="eye" />
            </button>
          </div>
          {passwordChanged && (
            <p class="field__hint">שינוי סיסמה: אחרי השמירה פרסמו שוב, ומסרו את הסיסמה החדשה לעובדים.</p>
          )}
        </section>

        <section>
          <h3>2. חיבור ל-GitHub (רק במכשיר שממנו מפרסמים)</h3>
          <p class="muted">
            עובדים שרק משתמשים בקטלוג לא צריכים את השלב הזה. בלי חיבור אפשר לפרסם גם ידנית (האפליקציה תדריך אתכם).
          </p>
          <details class="howto">
            <summary>איך יוצרים מפתח גישה (פעם אחת, כ-3 דקות)</summary>
            <ol>
              <li>
                היכנסו לחשבון GitHub ופתחו את{' '}
                <a href={GITHUB_TOKEN_URL} target="_blank" rel="noopener noreferrer">
                  דף יצירת המפתח
                </a>
                .
              </li>
              <li>
                <b>Token name</b>: כתבו "מחולל הצעות מחיר".
              </li>
              <li>
                <b>Expiration</b>: בחרו את התקופה הארוכה ביותר (כשהמפתח יפוג, פשוט יוצרים חדש).
              </li>
              <li>
                <b>Repository access</b>: בחרו <b>Only select repositories</b> ואז את המאגר <b>{REPO.repo}</b>.
              </li>
              <li>
                <b>Permissions</b> ← <b>Repository permissions</b> ← <b>Contents</b>: בחרו <b>Read and write</b>.
              </li>
              <li>
                לחצו <b>Generate token</b>, העתיקו את המפתח (מתחיל ב-<span dir="ltr">github_pat_</span>) והדביקו כאן.
              </li>
            </ol>
          </details>
          <div class="password-row">
            <input
              class="input"
              type="password"
              dir="ltr"
              aria-label="מפתח גישה ל-GitHub"
              placeholder="github_pat_…"
              autoComplete="off"
              value={token}
              onInput={(e) => setToken(e.currentTarget.value)}
            />
            <button type="button" class="btn btn--sm" disabled={!token.trim() || testing} onClick={test}>
              {testing ? 'בודק…' : 'בדיקת חיבור'}
            </button>
          </div>
          <p class="field__hint">המפתח והסיסמה נשמרים רק בדפדפן של המכשיר הזה.</p>
        </section>
      </div>
    </Modal>
  );
}

function ManualPublish({ blob, onClose, onDone }: { blob: Blob; onClose: () => void; onDone: () => void }) {
  return (
    <Modal
      title="פרסום ידני דרך אתר GitHub"
      onClose={onClose}
      footer={
        <>
          <button type="button" class="btn" onClick={onClose}>
            ביטול
          </button>
          <button type="button" class="btn btn--primary" onClick={onDone}>
            סיימתי להעלות
          </button>
        </>
      }
    >
      <ol class="manual-steps">
        <li>
          הקובץ <b dir="ltr">{PUBLISHED_FILE_NAME}</b> ירד עכשיו למחשב (בתיקיית ההורדות).{' '}
          <button type="button" class="btn btn--sm btn--ghost" onClick={() => download(blob, PUBLISHED_FILE_NAME)}>
            להוריד שוב
          </button>
        </li>
        <li>
          פתחו את{' '}
          <a href={GITHUB_UPLOAD_URL} target="_blank" rel="noopener noreferrer">
            דף ההעלאה ב-GitHub
          </a>{' '}
          (צריך להיות מחוברים לחשבון).
        </li>
        <li>גררו את הקובץ לחלון, או לחצו "choose your files" ובחרו אותו.</li>
        <li>
          לחצו על הכפתור הירוק <b>Commit changes</b>. אם GitHub שואל, השאירו את האפשרות "Commit directly to the main
          branch".
        </li>
        <li>
          חזרו לכאן ולחצו "סיימתי להעלות". תוך כ-2 דקות כל המכשירים יקבלו את הקטלוג (אפשר לעקוב{' '}
          <a href={GITHUB_ACTIONS_URL} target="_blank" rel="noopener noreferrer">
            כאן
          </a>
          ).
        </li>
      </ol>
      <p class="field__hint">טיפ: חיבור GitHub בהגדרות הפרסום חוסך את כל השלבים האלה – הפרסום יהיה בלחיצה אחת.</p>
    </Modal>
  );
}

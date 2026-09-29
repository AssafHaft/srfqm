import { BRAND, FOOTER_TEXT } from '../brand/brand';
import { Icon } from '../components/icons';
import { Field, NumberField, Segmented, TextAreaField, TextField } from '../components/inputs';
import { formatDate } from '../lib/dates';
import { formatQuoteNumber, takeQuoteNumber } from '../lib/numbering';
import { settings, storageAvailable, storagePersisted, updateSettings } from '../store/store';
import { CloudCard } from './CloudCard';
import { ImportButton } from './ImportButton';
import { downloadBackup } from './QuotesList';

export function SettingsView() {
  const s = settings.value;
  const next = takeQuoteNumber(s).number;
  return (
    <div class="page page--narrow">
      <div class="page__head">
        <h1 class="page__title">הגדרות</h1>
      </div>

      <CloudCard />

      <section class="card">
        <div class="card__head">
          <h2 class="card__title">מע"מ ומחירים</h2>
        </div>
        <div class="grid-2">
          <NumberField
            label='שיעור מע"מ'
            suffix="%"
            value={s.vatRate}
            onCommit={(v) => updateSettings({ vatRate: v })}
            hint="חל על הצעות חדשות. הצעות קיימות שומרות על השיעור שבו נוצרו ומציגות אפשרות לעדכון."
          />
          <NumberField label="תוקף ברירת מחדל (ימים)" decimals={0} value={s.defaultValidDays} onCommit={(v) => updateSettings({ defaultValidDays: v })} />
        </div>
        <Field label="הצעות חדשות מציגות מחירים">
          <Segmented
            label="ברירת מחדל להצגת מחירים"
            value={s.defaultPricesIncludeVat ? 'incl' : 'excl'}
            onChange={(v) => updateSettings({ defaultPricesIncludeVat: v === 'incl' })}
            options={[
              { value: 'incl', label: 'כולל מע"מ' },
              { value: 'excl', label: 'לפני מע"מ' },
            ]}
          />
        </Field>
        <Field label="המחירים בקטלוג" hint='הקטלוג שומר מחיר אחד לכל פריט; בהצעה הוא מומר אוטומטית לפי אופן ההצגה.'>
          <Segmented
            label="בסיס מחירי הקטלוג"
            value={s.catalogPricesIncludeVat ? 'incl' : 'excl'}
            onChange={(v) => updateSettings({ catalogPricesIncludeVat: v === 'incl' })}
            options={[
              { value: 'incl', label: 'כוללים מע"מ' },
              { value: 'excl', label: 'לפני מע"מ' },
            ]}
          />
        </Field>
      </section>

      <section class="card">
        <div class="card__head">
          <h2 class="card__title">מספור הצעות</h2>
        </div>
        <div class="grid-2">
          <TextField label="קידומת" dir="ltr" value={s.numberPrefix} onInput={(v) => updateSettings({ numberPrefix: v })} />
          <NumberField
            label="המספר הרץ הבא"
            decimals={0}
            min={1}
            value={s.numberYear === new Date().getFullYear() ? s.nextNumber : 1}
            onCommit={(v) => updateSettings({ nextNumber: Math.max(1, v), numberYear: new Date().getFullYear() })}
            hint={
              <>
                ההצעה הבאה: <bdi dir="ltr">{next}</bdi>. המספור מתחיל מחדש בכל שנה (למשל{' '}
                <bdi dir="ltr">{formatQuoteNumber(s.numberPrefix, new Date().getFullYear() + 1, 1)}</bdi>).
              </>
            }
          />
        </div>
      </section>

      <section class="card">
        <div class="card__head">
          <h2 class="card__title">הערות ברירת מחדל</h2>
        </div>
        <TextAreaField
          label="הערות שיתווספו לכל הצעה חדשה"
          value={s.defaultNotes}
          onInput={(v) => updateSettings({ defaultNotes: v })}
          hint="כל שורה היא סעיף. ניתן לערוך אותן בכל הצעה."
          minRows={3}
        />
      </section>

      <section class="card">
        <div class="card__head">
          <h2 class="card__title">גיבוי ושחזור</h2>
        </div>
        <p class="muted">
          כל הנתונים (הצעות, קטלוג והגדרות) נשמרים בדפדפן במכשיר זה בלבד. קובץ הגיבוי מאפשר להעביר אותם למכשיר אחר ולשחזר
          במקרה הצורך. שמרו אותו במקום פרטי — הוא כולל מחירים ופרטי לקוחות.
        </p>
        <div class="btn-row">
          <button type="button" class="btn btn--primary" onClick={downloadBackup}>
            <Icon name="pdf" />
            שמירת קובץ גיבוי
          </button>
          <ImportButton label="שחזור מגיבוי" />
        </div>
        <p class="field__hint">
          גיבוי אחרון: {s.lastBackupAt ? formatDate(s.lastBackupAt.slice(0, 10)) : 'טרם בוצע'}
          {' · '}
          {!storageAvailable.value
            ? 'האחסון בדפדפן אינו זמין — הנתונים לא יישמרו!'
            : storagePersisted.value
              ? 'האחסון מוגן מפני מחיקה אוטומטית.'
              : 'הדפדפן עלול למחוק נתונים שלא נעשה בהם שימוש זמן רב — התקינו את האפליקציה במסך הבית ושמרו גיבויים.'}
        </p>
      </section>

      <section class="card card--locked">
        <div class="card__head">
          <h2 class="card__title">
            <Icon name="lock" size={18} /> מיתוג (נעול)
          </h2>
        </div>
        <p class="muted">
          הלוגו, הצבעים, הגופנים, סדר הסעיפים, פרטי החברה והתנאים הקבועים נעולים ואינם ניתנים לשינוי מתוך האפליקציה, כדי
          שכל הצעה תיראה זהה. שינוי בהם נעשה בקוד בלבד.
        </p>
        <dl class="kv">
          <dt>שם החברה</dt>
          <dd>{BRAND.companyName}</dd>
          <dt>{BRAND.companyIdLabel}</dt>
          <dd>{BRAND.companyId}</dd>
          <dt>כתובת</dt>
          <dd>{BRAND.address}</dd>
          <dt>שורת תחתית</dt>
          <dd>{FOOTER_TEXT}</dd>
        </dl>
      </section>

      <p class="app-version">גרסה {__APP_VERSION__}</p>
    </div>
  );
}

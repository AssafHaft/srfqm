import { useState } from 'preact/hooks';
import { Icon } from '../components/icons';
import { Modal } from '../components/Modal';
import { toast } from '../components/toast';
import {
  addMember,
  checkVerified,
  cloudConfig,
  cloudError,
  cloudMembers,
  cloudState,
  cloudUser,
  isOwner,
  removeMember,
  resendVerification,
  resetPassword,
  retrySync,
  signIn,
  signOutCloud,
  signUp,
  useCloudConfig,
  type CloudState,
} from '../cloud/cloud';
import { buildRules, CLOUD_FILE_NAME, CLOUD_REPO_PATH, isValidEmail, normalizeEmail, parseFirebaseConfig, type CloudConfig } from '../cloud/config';
import { commitFileToGithub, GITHUB_UPLOAD_URL, githubToken, PublishError } from '../store/sync';

const SITE_DOMAIN = typeof location !== 'undefined' ? location.hostname : 'assafhaft.github.io';

export const CLOUD_STATUS: Record<CloudState, string> = {
  off: 'לא מוגדר',
  loading: 'מתחבר…',
  'signed-out': 'לא מחובר',
  unverified: 'ממתין לאימות אימייל',
  'not-member': 'ממתין לאישור',
  syncing: 'מסנכרן…',
  synced: 'מסונכרן',
  offline: 'לא מקוון – יסונכרן כשיחזור החיבור',
  error: 'שגיאה',
};

/** Settings page card: quote sync between devices. */
export function CloudCard() {
  const [setupOpen, setSetupOpen] = useState(false);
  const state = cloudState.value;
  const user = cloudUser.value;

  return (
    <section class="card">
      <div class="card__head">
        <h2 class="card__title">
          <Icon name="cloud" size={18} /> סנכרון הצעות בין מכשירים
        </h2>
        {state !== 'off' && <span class={`cloud-pill cloud-pill--${state}`}>{CLOUD_STATUS[state]}</span>}
      </div>

      {state === 'off' && (
        <>
          <p class="muted">
            כרגע ההצעות נשמרות רק במכשיר שבו נוצרו. אחרי הגדרה חד-פעמית (כ-15 דקות, בחינם) כל הצעה תופיע בכל המכשירים
            שלכם ושל העובדים תוך שנייה, גם במחשב וגם בטלפון. עובדים לא צריכים לבצע את ההגדרה – רק להתחבר.
          </p>
          <button type="button" class="btn btn--primary" onClick={() => setSetupOpen(true)}>
            <Icon name="cloud" />
            הגדרת סנכרון (פעם אחת)
          </button>
        </>
      )}

      {state === 'loading' && <p class="muted">מתחבר לענן…</p>}
      {state === 'signed-out' && <AuthForm />}
      {state === 'unverified' && user && <VerifyEmail email={user.email} />}
      {state === 'not-member' && user && <NotMember email={user.email} />}
      {state === 'error' && <p class="notice notice--warn">{cloudError.value || 'אירעה שגיאה בחיבור לענן.'}</p>}

      {(state === 'synced' || state === 'syncing' || state === 'offline') && user && (
        <>
          <p class="muted">
            מחובר כ-<b dir="ltr">{user.email}</b>. כל הצעה שנשמרת כאן מופיעה בשאר המכשירים, ושינויים שנעשים במצב לא מקוון נשלחים
            כשחוזר החיבור.
          </p>
          {isOwner() && <Members />}
        </>
      )}

      {state !== 'off' && state !== 'loading' && (
        <div class="btn-row">
          {user && (
            <button type="button" class="btn btn--sm" onClick={() => void signOutCloud()}>
              יציאה מהחשבון
            </button>
          )}
          {(isOwner() || state === 'error') && (
            <button type="button" class="btn btn--sm btn--ghost" onClick={() => setSetupOpen(true)}>
              הגדרות Firebase
            </button>
          )}
        </div>
      )}

      {setupOpen && <CloudSetup onClose={() => setSetupOpen(false)} />}
    </section>
  );
}

function AuthForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<string | null>, ok?: string) => {
    setBusy(true);
    const err = await fn();
    setBusy(false);
    if (err) toast(err, 'error');
    else if (ok) toast(ok);
  };
  return (
    <form
      class="auth-form"
      onSubmit={(e) => {
        e.preventDefault();
        void act(() => signIn(email, password));
      }}
    >
      <p class="muted">התחברו כדי לראות ולשמור הצעות מכל המכשירים. בפעם הראשונה לחצו "יצירת חשבון".</p>
      <input class="input" type="email" dir="ltr" placeholder="אימייל" aria-label="אימייל" autoComplete="username" value={email} onInput={(e) => setEmail(e.currentTarget.value)} />
      <input
        class="input"
        type="password"
        dir="ltr"
        placeholder="סיסמה"
        aria-label="סיסמה"
        autoComplete="current-password"
        value={password}
        onInput={(e) => setPassword(e.currentTarget.value)}
      />
      <div class="btn-row">
        <button type="submit" class="btn btn--primary" disabled={busy || !email || !password}>
          כניסה
        </button>
        <button
          type="button"
          class="btn"
          disabled={busy || !email || password.length < 6}
          onClick={() => void act(() => signUp(email, password), 'החשבון נוצר. שלחנו אליכם מייל לאימות הכתובת.')}
        >
          יצירת חשבון
        </button>
        <button
          type="button"
          class="btn btn--ghost btn--sm"
          disabled={busy || !email}
          onClick={() => void act(() => resetPassword(email), 'נשלח מייל לאיפוס הסיסמה.')}
        >
          שכחתי סיסמה
        </button>
      </div>
    </form>
  );
}

function VerifyEmail({ email }: { email: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <div class="notice">
      <Icon name="alert" />
      <span>
        שלחנו מייל אימות ל-<b dir="ltr">{email}</b>. פתחו אותו, לחצו על הקישור, וחזרו לכאן. (לא הגיע? בדקו בתיקיית הספאם.)
      </span>
      <button
        type="button"
        class="btn btn--sm btn--primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const ok = await checkVerified();
          setBusy(false);
          if (!ok) toast('הכתובת עדיין לא אומתה. לחצו על הקישור במייל ונסו שוב.', 'error');
        }}
      >
        אימתתי
      </button>
      <button
        type="button"
        class="btn btn--sm btn--ghost"
        onClick={async () => {
          const err = await resendVerification();
          toast(err ?? 'המייל נשלח שוב', err ? 'error' : 'info');
        }}
      >
        שליחה חוזרת
      </button>
    </div>
  );
}

function NotMember({ email }: { email: string }) {
  return (
    <div class="notice notice--warn">
      <Icon name="lock" />
      <span>
        החשבון <b dir="ltr">{email}</b> עדיין לא אושר. בקשו מבעל העסק להוסיף את האימייל הזה ב"הגדרות ← סנכרון הצעות ← משתמשים",
        ואז לחצו "נסו שוב".
      </span>
      <button type="button" class="btn btn--sm" onClick={retrySync}>
        נסו שוב
      </button>
    </div>
  );
}

function Members() {
  const [email, setEmail] = useState('');
  const owner = cloudConfig.value?.owner ?? '';
  const add = async () => {
    if (!isValidEmail(email)) {
      toast('כתובת האימייל אינה תקינה.', 'error');
      return;
    }
    const err = await addMember(email);
    if (err) toast(err, 'error');
    else {
      toast(`${normalizeEmail(email)} נוסף. עכשיו הוא יכול ליצור חשבון ולהתחבר.`);
      setEmail('');
    }
  };
  return (
    <div class="members">
      <h3>משתמשים</h3>
      <p class="field__hint">
        מי שברשימה יכול להתחבר ולראות את כל ההצעות. הוסיפו את האימייל של העובד, ובמכשיר שלו הוא יבחר "יצירת חשבון" עם אותו אימייל.
      </p>
      <ul>
        <li>
          <span dir="ltr">{owner}</span> <small>(בעל העסק)</small>
        </li>
        {cloudMembers.value
          .filter((m) => m !== normalizeEmail(owner))
          .map((m) => (
            <li key={m}>
              <span dir="ltr">{m}</span>
              <button
                type="button"
                class="icon-btn icon-btn--danger"
                aria-label={`הסרת ${m}`}
                onClick={async () => {
                  if (!confirm(`להסיר את ${m}? הוא לא יוכל לראות יותר את ההצעות.`)) return;
                  const err = await removeMember(m);
                  if (err) toast(err, 'error');
                }}
              >
                <Icon name="trash" />
              </button>
            </li>
          ))}
      </ul>
      <form
        class="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <input class="input" type="email" dir="ltr" placeholder="worker@example.com" aria-label="אימייל של משתמש חדש" value={email} onInput={(e) => setEmail(e.currentTarget.value)} />
        <button type="submit" class="btn">
          <Icon name="plus" />
          הוספה
        </button>
      </form>
    </div>
  );
}

function download(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** One-time Firebase setup wizard for the owner. */
function CloudSetup({ onClose }: { onClose: () => void }) {
  const current = cloudConfig.value;
  const [owner, setOwner] = useState(current?.owner ?? '');
  const [configText, setConfigText] = useState(current ? JSON.stringify(current.firebase, null, 2) : '');
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState<string | null>(null);
  const parsed = parseFirebaseConfig(configText);
  const ownerOk = isValidEmail(owner);
  const rules = buildRules(ownerOk ? owner : 'your-email@example.com');

  const save = async () => {
    if (!parsed || !ownerOk) return;
    const config: CloudConfig = { firebase: parsed, owner: normalizeEmail(owner) };
    const text = `${JSON.stringify(config, null, 2)}\n`;
    setBusy(true);
    await useCloudConfig(config);
    if (githubToken.value) {
      try {
        await commitFileToGithub(CLOUD_REPO_PATH, text, 'הגדרת סנכרון הצעות (Firebase)');
        toast('הסנכרון הוגדר! שאר המכשירים יזהו אותו תוך כ-2 דקות.');
        onClose();
      } catch (err) {
        toast(err instanceof PublishError ? err.message : 'הפרסום ל-GitHub נכשל.', 'error');
        setManual(text);
      }
    } else {
      download(text, CLOUD_FILE_NAME);
      setManual(text);
    }
    setBusy(false);
  };

  if (manual) {
    return (
      <Modal
        title="שלב אחרון: העלאת קובץ ההגדרות"
        onClose={onClose}
        footer={
          <button type="button" class="btn btn--primary" onClick={onClose}>
            סיימתי
          </button>
        }
      >
        <p class="muted">המכשיר הזה כבר מחובר. כדי ששאר המכשירים יזהו את הסנכרון אוטומטית:</p>
        <ol class="manual-steps">
          <li>
            הקובץ <b dir="ltr">{CLOUD_FILE_NAME}</b> ירד למחשב.{' '}
            <button type="button" class="btn btn--sm btn--ghost" onClick={() => download(manual, CLOUD_FILE_NAME)}>
              להוריד שוב
            </button>
          </li>
          <li>
            פתחו את{' '}
            <a href={GITHUB_UPLOAD_URL} target="_blank" rel="noopener noreferrer">
              דף ההעלאה ב-GitHub
            </a>
            , גררו אליו את הקובץ ולחצו <b>Commit changes</b>.
          </li>
        </ol>
      </Modal>
    );
  }

  return (
    <Modal
      title="הגדרת סנכרון הצעות (פעם אחת)"
      onClose={onClose}
      footer={
        <button type="button" class="btn btn--primary" disabled={!parsed || !ownerOk || busy} onClick={() => void save()}>
          {busy ? 'שומר…' : 'שמירה וחיבור'}
        </button>
      }
    >
      <ol class="setup-steps">
        <li>
          <b>יצירת פרויקט:</b> היכנסו ל-
          <a href="https://console.firebase.google.com/" target="_blank" rel="noopener noreferrer">
            Firebase Console
          </a>{' '}
          עם חשבון Google, לחצו <b>Create a project</b>, תנו שם (למשל srfpark-quotes). את Google Analytics אפשר לכבות.
        </li>
        <li>
          <b>כניסה עם אימייל:</b> בתפריט <b>Build ← Authentication ← Get started</b>, בחרו <b>Email/Password</b>, הפעילו
          את האפשרות הראשונה (Enable) ושמרו. אחר כך בלשונית <b>Settings ← Authorized domains</b> לחצו <b>Add domain</b>{' '}
          והוסיפו: <b dir="ltr">{SITE_DOMAIN}</b>
        </li>
        <li>
          <b>מסד נתונים:</b> בתפריט <b>Build ← Firestore Database ← Create database</b>. מיקום: <b dir="ltr">eur3 (Europe)</b>,
          ואז <b>Start in production mode</b>.
        </li>
        <li>
          <b>הרשאות:</b> כתבו את האימייל שלכם (בעל העסק), העתיקו את הכללים, ובלשונית <b>Rules</b> של Firestore החליפו את כל
          הטקסט בכללים האלה ולחצו <b>Publish</b>.
          <input
            class="input"
            type="email"
            dir="ltr"
            placeholder="owner@example.com"
            aria-label="האימייל של בעל העסק"
            value={owner}
            onInput={(e) => setOwner(e.currentTarget.value)}
          />
          <textarea class="input rules" dir="ltr" readOnly rows={6} value={rules} aria-label="כללי אבטחה" />
          <button
            type="button"
            class="btn btn--sm"
            disabled={!ownerOk}
            onClick={() => void navigator.clipboard?.writeText(rules).then(() => toast('הכללים הועתקו'))}
          >
            העתקת הכללים
          </button>
        </li>
        <li>
          <b>חיבור האפליקציה:</b> לחצו על גלגל השיניים ← <b>Project settings</b>. למטה ב-<b>Your apps</b> לחצו על הסמל{' '}
          <b dir="ltr">&lt;/&gt;</b>, תנו שם ולחצו <b>Register app</b>. העתיקו את כל קטע הקוד שמופיע (firebaseConfig) והדביקו
          כאן:
          <textarea
            class="input rules"
            dir="ltr"
            rows={6}
            placeholder={'const firebaseConfig = {\n  apiKey: "...",\n  ...\n};'}
            aria-label="הגדרות Firebase"
            value={configText}
            onInput={(e) => setConfigText(e.currentTarget.value)}
          />
          {configText && (
            <div class={parsed ? 'field__hint ok' : 'field__hint err'}>
              {parsed ? `✓ זוהה הפרויקט ${parsed.projectId}` : 'לא זוהו כל הפרטים – ודאו שהעתקתם את כל הקטע.'}
            </div>
          )}
        </li>
        <li>
          <b>סיום:</b> לחצו "שמירה וחיבור", ואז צרו לעצמכם חשבון עם אותו אימייל (כפתור "יצירת חשבון").
          {!githubToken.value && ' מאחר שלא הוגדר מפתח GitHub, האפליקציה תדריך אתכם להעלות קובץ אחד ל-GitHub.'}
        </li>
      </ol>
    </Modal>
  );
}

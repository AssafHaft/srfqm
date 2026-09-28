import { useState } from 'preact/hooks';
import { toast } from '../components/toast';
import { WrongPasswordError } from '../lib/crypto';
import { catalogPassword, dismissRemoteUpdate, loadPublished, remoteUpdate } from '../store/sync';
import { formatDateTime } from './CatalogSync';

/** Shown when the site has a newer catalog that this device could not load on its own. */
export function RemoteCatalogBanner() {
  const update = remoteUpdate.value;
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  if (!update) return null;

  const load = async (pw: string) => {
    setBusy(true);
    try {
      await loadPublished(update.file, pw);
      toast('הקטלוג המעודכן נטען');
      setPassword('');
    } catch (err) {
      toast(err instanceof WrongPasswordError ? 'הסיסמה שגויה. נסו שוב.' : 'טעינת הקטלוג נכשלה.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const date = formatDateTime(update.file.publishedAt);
  if (update.reason === 'local-changes') {
    return (
      <div class="banner banner--sync">
        <span>באתר יש קטלוג חדש יותר (מ-{date}), אבל במכשיר הזה יש שינויים בקטלוג שלא פורסמו.</span>
        <button
          type="button"
          class="btn btn--sm"
          disabled={busy}
          onClick={() => {
            if (confirm('לטעון את הקטלוג מהאתר? השינויים שלא פורסמו במכשיר הזה יימחקו.')) void load(catalogPassword.value);
          }}
        >
          טעינה מהאתר
        </button>
        <button type="button" class="btn btn--sm btn--ghost" onClick={dismissRemoteUpdate}>
          השארת הקטלוג שלי
        </button>
      </div>
    );
  }

  return (
    <form
      class="banner banner--sync"
      onSubmit={(e) => {
        e.preventDefault();
        if (password) void load(password);
      }}
    >
      <span>
        {update.reason === 'wrong-password'
          ? 'סיסמת הקטלוג השתנתה. הזינו את הסיסמה החדשה כדי לקבל את הקטלוג המעודכן:'
          : `יש קטלוג מעודכן באתר (מ-${date}). הזינו את סיסמת הקטלוג כדי לטעון אותו:`}
      </span>
      <input
        class="input input--inline"
        type="password"
        aria-label="סיסמת הקטלוג"
        value={password}
        onInput={(e) => setPassword(e.currentTarget.value)}
      />
      <button type="submit" class="btn btn--sm btn--primary" disabled={!password || busy}>
        טעינה
      </button>
      <button type="button" class="btn btn--sm btn--ghost" onClick={dismissRemoteUpdate}>
        לא עכשיו
      </button>
    </form>
  );
}

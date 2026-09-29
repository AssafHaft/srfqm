import { signal } from '@preact/signals';
import { formatQuoteNumber, highestSeq } from '../lib/numbering';
import type { Settings } from '../model/types';
import {
  applyRemoteDelete,
  applyRemoteQuote,
  getQuote,
  onLocalQuoteChange,
  onLocalSettingsChange,
  quotes,
  setSharedNumbering,
  settings,
  updateSettings,
} from '../store/store';
import { CLOUD_FILE_NAME, isCloudConfig, normalizeEmail, type CloudConfig } from './config';
import type { CloudApi, SharedSettings } from './firebase';
import { incoming, reconcile } from './merge';

/*
 * Quote sync between devices through Firebase (Firestore + e-mail/password sign-in).
 * The local IndexedDB copy stays the working copy, so the app keeps working offline; this module
 * mirrors it to the cloud and applies changes made on other devices (last edit wins).
 */

export type CloudState =
  | 'off' // no cloud configured
  | 'loading'
  | 'signed-out'
  | 'unverified' // signed in, e-mail not verified yet
  | 'not-member' // signed in, but the owner has not added this e-mail
  | 'syncing'
  | 'synced'
  | 'offline'
  | 'error';

export const cloudState = signal<CloudState>('off');
export const cloudConfig = signal<CloudConfig | null>(null);
export const cloudUser = signal<{ email: string; verified: boolean } | null>(null);
export const cloudError = signal('');
export const cloudMembers = signal<string[]>([]);

const LS_CONFIG = 'srfqm.cloudConfig';
const SHARED_KEYS = ['vatRate', 'defaultValidDays', 'numberPrefix', 'defaultPricesIncludeVat', 'defaultNotes'] as const;

let api: CloudApi | null = null;
let stopUser: (() => void) | null = null;
let stopSync: (() => void)[] = [];

export const isOwner = () => !!cloudUser.value && !!cloudConfig.value && normalizeEmail(cloudUser.value.email) === normalizeEmail(cloudConfig.value.owner);

function readLocalConfig(): CloudConfig | null {
  try {
    const raw = localStorage.getItem(LS_CONFIG);
    const v: unknown = raw ? JSON.parse(raw) : null;
    return isCloudConfig(v) ? v : null;
  } catch {
    return null;
  }
}

async function fetchPublishedConfig(): Promise<CloudConfig | null> {
  try {
    const res = await fetch(`./${CLOUD_FILE_NAME}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const v: unknown = await res.json();
    return isCloudConfig(v) ? v : null;
  } catch {
    return null;
  }
}

/** Starts sync if this device (or the site) has a cloud config. Safe to call once at startup. */
export async function initCloud(): Promise<void> {
  const config = readLocalConfig() ?? (await fetchPublishedConfig());
  if (config) await startCloud(config);
}

/** Saves a config on this device (setup wizard) and connects. */
export async function useCloudConfig(config: CloudConfig): Promise<void> {
  try {
    localStorage.setItem(LS_CONFIG, JSON.stringify(config));
  } catch {
    /* kept for this session */
  }
  await startCloud(config);
}

async function startCloud(config: CloudConfig): Promise<void> {
  stopAll();
  try {
    // Automated tests run against the local Firebase emulators.
    if (localStorage.getItem('srfqm.cloudEmulator') === '1') config = { ...config, emulator: true };
  } catch {
    /* no storage */
  }
  cloudConfig.value = config;
  cloudState.value = 'loading';
  try {
    const { createCloud } = await import('./firebase');
    api = createCloud(config);
  } catch (err) {
    console.error(err);
    cloudError.value = 'לא ניתן להתחבר לענן. בדקו את הגדרות Firebase.';
    cloudState.value = 'error';
    return;
  }
  stopUser = api.onUser((user) => {
    stopSyncing();
    cloudUser.value = user;
    if (!user) cloudState.value = 'signed-out';
    else if (!user.verified) cloudState.value = 'unverified';
    else startSyncing();
  });
}

function stopSyncing(): void {
  stopSync.forEach((fn) => fn());
  stopSync = [];
  setSharedNumbering(null);
  cloudMembers.value = [];
}

function stopAll(): void {
  stopSyncing();
  stopUser?.();
  stopUser = null;
  api = null;
}

function describe(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  const map: Record<string, string> = {
    'auth/invalid-credential': 'האימייל או הסיסמה שגויים.',
    'auth/wrong-password': 'האימייל או הסיסמה שגויים.',
    'auth/user-not-found': 'לא נמצא חשבון עם האימייל הזה. אפשר ליצור חשבון חדש.',
    'auth/email-already-in-use': 'כבר קיים חשבון עם האימייל הזה. היכנסו עם הסיסמה שלו.',
    'auth/weak-password': 'הסיסמה צריכה להכיל לפחות 6 תווים.',
    'auth/invalid-email': 'כתובת האימייל אינה תקינה.',
    'auth/too-many-requests': 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.',
    'auth/network-request-failed': 'אין חיבור לאינטרנט.',
    'auth/operation-not-allowed': 'כניסה עם אימייל וסיסמה לא הופעלה בפרויקט Firebase (שלב 2 בהגדרה).',
    'permission-denied': 'אין הרשאה. ודאו שבעל העסק הוסיף את האימייל שלכם לרשימת המשתמשים.',
  };
  return map[code] ?? 'הפעולה נכשלה. נסו שוב.';
}

// ---------------------------------------------------------------------------
// Sync

function pickShared(s: Settings): SharedSettings {
  return Object.fromEntries(SHARED_KEYS.map((k) => [k, s[k]]));
}

function startSyncing(): void {
  const cloud = api;
  if (!cloud) return;
  cloudState.value = 'syncing';
  const pending = new Map<string, ReturnType<typeof setTimeout>>();

  const upload = (id: string) => {
    const q = getQuote(id);
    if (q) void cloud.putQuote(q).catch(onWriteError);
  };
  const onWriteError = (err: unknown) => {
    if ((err as { code?: string }).code === 'permission-denied') cloudState.value = 'not-member';
  };

  const stopQuotes = cloud.watchQuotes(
    (remote) => {
      const r = reconcile(quotes.value, remote);
      r.putLocal.forEach(applyRemoteQuote);
      r.deleteLocal.forEach(applyRemoteDelete);
      r.upload.forEach((q) => void cloud.putQuote(q).catch(onWriteError));
    },
    (change) => {
      const action = incoming(getQuote(change.id), change);
      if (action === 'put' && change.quote) applyRemoteQuote(change.quote);
      else if (action === 'delete') applyRemoteDelete(change.id);
    },
    (err) => {
      if (err.code === 'permission-denied') cloudState.value = 'not-member';
      else {
        cloudError.value = describe(err);
        cloudState.value = 'error';
      }
    },
    (fromCache) => {
      if (cloudState.value === 'not-member' || cloudState.value === 'error') return;
      cloudState.value = fromCache && !navigator.onLine ? 'offline' : fromCache ? 'syncing' : 'synced';
    },
  );

  // Local edits → cloud (debounced per quote while typing).
  const stopLocal = onLocalQuoteChange((change) => {
    const id = change.type === 'put' ? change.quote.id : change.id;
    clearTimeout(pending.get(id));
    if (change.type === 'delete') {
      pending.delete(id);
      void cloud.deleteQuote(id, change.at).catch(onWriteError);
      return;
    }
    pending.set(
      id,
      setTimeout(() => {
        pending.delete(id);
        upload(id);
      }, 700),
    );
  });
  const flush = () => {
    for (const [id, t] of pending) {
      clearTimeout(t);
      upload(id);
    }
    pending.clear();
  };
  const onHide = () => document.visibilityState === 'hidden' && flush();
  document.addEventListener('visibilitychange', onHide);

  // Shared settings (VAT rate, numbering prefix, defaults).
  let lastShared = JSON.stringify(pickShared(settings.value));
  const stopSettings = cloud.watchSettings(
    (remote, fromCache) => {
      if (remote) {
        const patch: Partial<Settings> = {};
        for (const k of SHARED_KEYS) if (k in remote) (patch as Record<string, unknown>)[k] = remote[k];
        updateSettings(patch, true);
        lastShared = JSON.stringify(pickShared(settings.value));
      } else if (!fromCache) {
        // First device to connect: its settings become the shared ones.
        void cloud.putSettings(pickShared(settings.value)).catch(onWriteError);
      }
    },
    () => undefined,
  );
  const stopLocalSettings = onLocalSettingsChange((s) => {
    const shared = JSON.stringify(pickShared(s));
    if (shared === lastShared) return;
    lastShared = shared;
    void cloud.putSettings(pickShared(s)).catch(onWriteError);
  });

  // Shared quote numbering.
  setSharedNumbering(async (fresh) => {
    // Never below a number already used on any device (e.g. quotes made before sync was set up).
    const year = new Date().getFullYear();
    const others = quotes.value.filter((q) => q.id !== fresh.id).map((q) => q.number);
    const { seq } = await cloud.takeNumber(highestSeq(others, year) + 1);
    updateSettings({ numberYear: year, nextNumber: seq + 1 }, true);
    return formatQuoteNumber(settings.value.numberPrefix, year, seq);
  });

  // Users list (owner only).
  const stopMembers = isOwner() ? cloud.watchMembers((m) => (cloudMembers.value = m), () => undefined) : () => undefined;

  const onOnline = () => {
    if (cloudState.value === 'offline') cloudState.value = 'syncing';
  };
  const onOffline = () => {
    if (cloudState.value === 'synced' || cloudState.value === 'syncing') cloudState.value = 'offline';
  };
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);

  stopSync = [
    stopQuotes,
    () => {
      flush();
      stopLocal();
    },
    stopSettings,
    stopLocalSettings,
    stopMembers,
    () => document.removeEventListener('visibilitychange', onHide),
    () => window.removeEventListener('online', onOnline),
    () => window.removeEventListener('offline', onOffline),
  ];
}

// ---------------------------------------------------------------------------
// Account actions (return an error message, or null on success)

async function run(fn: (cloud: CloudApi) => Promise<void>): Promise<string | null> {
  if (!api) return 'הענן אינו מוגדר.';
  try {
    await fn(api);
    return null;
  } catch (err) {
    return describe(err);
  }
}

export const signIn = (email: string, password: string) => run((c) => c.signIn(email.trim(), password));
export const signUp = (email: string, password: string) => run((c) => c.signUp(email.trim(), password));
export const resendVerification = () => run((c) => c.resendVerification());
export const resetPassword = (email: string) => run((c) => c.resetPassword(email.trim()));
export const signOutCloud = () => run((c) => c.signOut());
export const addMember = (email: string) => run((c) => c.addMember(normalizeEmail(email)));
export const removeMember = (email: string) => run((c) => c.removeMember(email));

/** After the user clicked the link in the verification e-mail. */
export async function checkVerified(): Promise<boolean> {
  if (!api) return false;
  const user = await api.refreshUser().catch(() => null);
  cloudUser.value = user;
  if (user?.verified) {
    stopSyncing();
    startSyncing();
    return true;
  }
  return false;
}

/** Retries after the owner added this user. */
export function retrySync(): void {
  if (!api || !cloudUser.value?.verified) return;
  stopSyncing();
  startSyncing();
}

import { signal } from '@preact/signals';
import { decryptJson, encryptJson, isEncryptedFile, textToBase64, base64ToText, WrongPasswordError, type EncryptedFile } from '../lib/crypto';
import { normalizeCatalog } from '../model/normalize';
import { applyPublishedCatalog, catalog, catalogSync, setCatalogSync, settings } from './store';

/*
 * Shared catalog: the owner publishes the catalog as an encrypted file committed to the repository
 * (public/catalog.enc.json), which the site then serves to every device. Devices that know the
 * catalog password load it automatically.
 */

export const REPO = { owner: 'AssafHaft', repo: 'srfqm', branch: 'main', path: 'public/catalog.enc.json' } as const;
export const PUBLISHED_FILE_NAME = 'catalog.enc.json';
export const GITHUB_UPLOAD_URL = `https://github.com/${REPO.owner}/${REPO.repo}/upload/${REPO.branch}/public`;
export const GITHUB_TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';
export const GITHUB_ACTIONS_URL = `https://github.com/${REPO.owner}/${REPO.repo}/actions`;

const LS_PASSWORD = 'srfqm.catalogPassword';
const LS_TOKEN = 'srfqm.githubToken';

const readLS = (key: string) => {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
};
const writeLS = (key: string, value: string) => {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* storage unavailable: kept for this session only */
  }
};

/** Stored per device only (never in backups or the published file). */
export const catalogPassword = signal(readLS(LS_PASSWORD));
export const githubToken = signal(readLS(LS_TOKEN));

export function setCatalogPassword(value: string): void {
  catalogPassword.value = value;
  writeLS(LS_PASSWORD, value);
}

export function setGithubToken(value: string): void {
  githubToken.value = value.trim();
  writeLS(LS_TOKEN, value.trim());
}

interface PublishedPayload {
  catalog: unknown;
  catalogPricesIncludeVat: boolean;
}

export type RemoteReason = 'password' | 'wrong-password' | 'local-changes';
/** A newer published catalog that could not be applied automatically. */
export const remoteUpdate = signal<{ file: EncryptedFile; reason: RemoteReason } | null>(null);

// ---------------------------------------------------------------------------
// Loading the published catalog

async function fetchPublished(): Promise<EncryptedFile | null> {
  try {
    const res = await fetch(`./${PUBLISHED_FILE_NAME}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    return isEncryptedFile(json) ? json : null;
  } catch {
    return null;
  }
}

/** Installs a published catalog. Throws WrongPasswordError. */
export async function loadPublished(file: EncryptedFile, password: string): Promise<void> {
  const payload = (await decryptJson(file, password)) as Partial<PublishedPayload>;
  applyPublishedCatalog(normalizeCatalog(payload.catalog), payload.catalogPricesIncludeVat !== false, file.publishedAt);
  if (password !== catalogPassword.value) setCatalogPassword(password);
  remoteUpdate.value = null;
}

let lastCheck = 0;

/** Returns true when a newer catalog was installed. */
export async function checkPublishedCatalog(force = false): Promise<boolean> {
  if (!force && Date.now() - lastCheck < 60_000) return false;
  lastCheck = Date.now();
  const file = await fetchPublished();
  const known = catalogSync.value.publishedAt;
  if (!file || (known && file.publishedAt <= known)) {
    remoteUpdate.value = null;
    return false;
  }
  if (!catalogPassword.value) {
    remoteUpdate.value = { file, reason: 'password' };
    return false;
  }
  if (catalogSync.value.dirty) {
    remoteUpdate.value = { file, reason: 'local-changes' };
    return false;
  }
  try {
    await loadPublished(file, catalogPassword.value);
    return true;
  } catch (err) {
    if (err instanceof WrongPasswordError) remoteUpdate.value = { file, reason: 'wrong-password' };
    return false;
  }
}

export function dismissRemoteUpdate(): void {
  remoteUpdate.value = null;
}

// ---------------------------------------------------------------------------
// Publishing

export class PublishError extends Error {}
export class PublishConflictError extends Error {
  constructor(public remotePublishedAt: string) {
    super('remote catalog is newer');
  }
}

async function github(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(`https://api.github.com/repos/${REPO.owner}/${REPO.repo}${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  } catch {
    throw new PublishError('אין חיבור ל-GitHub. בדקו את החיבור לאינטרנט ונסו שוב.');
  }
}

function explain(status: number): string {
  if (status === 401) return 'מפתח הגישה ל-GitHub אינו תקין או שפג תוקפו. צרו מפתח חדש לפי ההוראות.';
  if (status === 403 || status === 404)
    return `למפתח הגישה אין הרשאת כתיבה למאגר ${REPO.repo}. ודאו שבחרתם את המאגר ושההרשאה Contents היא Read and write.`;
  if (status === 409 || status === 422) return 'GitHub דחה את העדכון. נסו שוב בעוד רגע.';
  return `GitHub החזיר שגיאה (${status}). נסו שוב מאוחר יותר.`;
}

/** Checks that the token can write to the repository. Returns an error message, or null when it works. */
export async function testGithubToken(token: string): Promise<string | null> {
  const res = await github('', token);
  if (!res.ok) return explain(res.status);
  const repo = (await res.json()) as { permissions?: { push?: boolean } };
  return repo.permissions?.push === false ? explain(403) : null;
}

export async function buildPublishedFile(): Promise<EncryptedFile> {
  const password = catalogPassword.value;
  if (!password) throw new PublishError('יש להגדיר סיסמת קטלוג לפני הפרסום.');
  const payload: PublishedPayload = { catalog: catalog.value, catalogPricesIncludeVat: settings.value.catalogPricesIncludeVat };
  return encryptJson(payload, password, new Date().toISOString());
}

/**
 * Commits the encrypted catalog to the repository. The site redeploys automatically and every device
 * picks the new catalog up on its next launch. Throws PublishConflictError when someone published a newer
 * catalog since this device last synced (pass `overwrite` to replace it anyway).
 */
export async function publishToGithub(overwrite = false): Promise<void> {
  const token = githubToken.value;
  if (!token) throw new PublishError('לא הוגדר מפתח גישה ל-GitHub.');
  const file = await buildPublishedFile();

  const current = await github(`/contents/${REPO.path}?ref=${REPO.branch}`, token);
  let sha: string | undefined;
  if (current.ok) {
    const body = (await current.json()) as { sha: string; content?: string };
    sha = body.sha;
    if (!overwrite && body.content) {
      try {
        const remote: unknown = JSON.parse(base64ToText(body.content));
        const known = catalogSync.value.publishedAt;
        if (isEncryptedFile(remote) && (!known || remote.publishedAt > known)) throw new PublishConflictError(remote.publishedAt);
      } catch (err) {
        if (err instanceof PublishConflictError) throw err;
      }
    }
  } else if (current.status !== 404) {
    throw new PublishError(explain(current.status));
  }

  const count = catalog.value.items.length;
  const res = await github(`/contents/${REPO.path}`, token, {
    method: 'PUT',
    body: JSON.stringify({
      message: `עדכון קטלוג (${count} מוצרים)`,
      content: textToBase64(`${JSON.stringify(file, null, 2)}\n`),
      branch: REPO.branch,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) throw new PublishError(explain(res.status));
  setCatalogSync({ publishedAt: file.publishedAt, dirty: false });
}

/** Manual alternative: the owner uploads this file on the GitHub website. */
export async function prepareManualPublish(): Promise<{ file: EncryptedFile; blob: Blob }> {
  const file = await buildPublishedFile();
  const blob = new Blob([`${JSON.stringify(file, null, 2)}\n`], { type: 'application/json' });
  return { file, blob };
}

export function markManuallyPublished(file: EncryptedFile): void {
  setCatalogSync({ publishedAt: file.publishedAt, dirty: false });
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkPublishedCatalog();
  });
}

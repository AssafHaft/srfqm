/**
 * Password-based encryption for the published catalog (the repository and the site are public).
 * PBKDF2-SHA256 derives an AES-256-GCM key; GCM also detects a wrong password or a tampered file.
 */

export const ENCRYPTED_KIND = 'catalog-encrypted';
const ITERATIONS = 310_000;

export interface EncryptedFile {
  app: 'srfqm';
  kind: typeof ENCRYPTED_KIND;
  version: 1;
  /** Not secret: lets devices tell whether they already have this version without the password. */
  publishedAt: string;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  iv: string;
  data: string;
}

export class WrongPasswordError extends Error {
  constructor() {
    super('הסיסמה שגויה.');
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** UTF-8 text → base64 (e.g. for the GitHub contents API). */
export function textToBase64(text: string): string {
  return toBase64(new TextEncoder().encode(text));
}

export function base64ToText(b64: string): string {
  return new TextDecoder().decode(fromBase64(b64.replace(/\s/g, '')));
}

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptJson(value: unknown, password: string, publishedAt: string): Promise<EncryptedFile> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ITERATIONS);
  const plain = new TextEncoder().encode(JSON.stringify(value));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
  return {
    app: 'srfqm',
    kind: ENCRYPTED_KIND,
    version: 1,
    publishedAt,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: toBase64(salt) },
    iv: toBase64(iv),
    data: toBase64(cipher),
  };
}

export function isEncryptedFile(v: unknown): v is EncryptedFile {
  const o = v as Partial<EncryptedFile> | null;
  return !!o && o.app === 'srfqm' && o.kind === ENCRYPTED_KIND && typeof o.data === 'string' && typeof o.iv === 'string' && !!o.kdf;
}

export async function decryptJson(file: EncryptedFile, password: string): Promise<unknown> {
  const key = await deriveKey(password, fromBase64(file.kdf.salt), file.kdf.iterations);
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(file.iv) }, key, fromBase64(file.data));
  } catch {
    throw new WrongPasswordError();
  }
  return JSON.parse(new TextDecoder().decode(plain));
}

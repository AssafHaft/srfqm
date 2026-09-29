/**
 * Cloud (Firebase) configuration. The Firebase web config is not secret — it only identifies the
 * project; access is enforced by the Firestore security rules below. It is published to the site as
 * public/cloud.json so every device finds the project automatically.
 */

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  storageBucket?: string;
  messagingSenderId?: string;
}

export interface CloudConfig {
  firebase: FirebaseWebConfig;
  /** The business owner's e-mail: the only account that can add or remove users. */
  owner: string;
  /** Test only: connect to the local Firebase emulators. */
  emulator?: boolean;
}

export const CLOUD_FILE_NAME = 'cloud.json';
export const CLOUD_REPO_PATH = 'public/cloud.json';

const REQUIRED: (keyof FirebaseWebConfig)[] = ['apiKey', 'authDomain', 'projectId', 'appId'];
const OPTIONAL: (keyof FirebaseWebConfig)[] = ['storageBucket', 'messagingSenderId'];

/**
 * Accepts what the Firebase console shows under "Your apps" — the `const firebaseConfig = {...}` snippet,
 * or plain JSON — and extracts the fields the app needs. Returns null when a required field is missing.
 */
export function parseFirebaseConfig(text: string): FirebaseWebConfig | null {
  const out: Partial<FirebaseWebConfig> = {};
  for (const key of [...REQUIRED, ...OPTIONAL]) {
    const m = new RegExp(`["']?${key}["']?\\s*:\\s*["'\`]([^"'\`]+)["'\`]`).exec(text);
    if (m) out[key] = m[1].trim();
  }
  return REQUIRED.every((k) => out[k]) ? (out as FirebaseWebConfig) : null;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function isCloudConfig(v: unknown): v is CloudConfig {
  const o = v as Partial<CloudConfig> | null;
  return !!o && typeof o.owner === 'string' && !!o.firebase && REQUIRED.every((k) => typeof o.firebase?.[k] === 'string');
}

/**
 * Firestore security rules for the project. Only e-mail-verified accounts that the owner added to
 * /members (plus the owner) can read or write anything.
 */
export function buildRules(owner: string): string {
  const email = normalizeEmail(owner).replace(/'/g, '');
  return `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function verified() {
      return request.auth != null && request.auth.token.email_verified == true;
    }
    function isOwner() {
      return verified() && request.auth.token.email.lower() == '${email}';
    }
    function isMember() {
      return isOwner() || (verified() && exists(/databases/$(database)/documents/members/$(request.auth.token.email.lower())));
    }
    match /members/{email} {
      allow read: if isMember();
      allow write: if isOwner();
    }
    match /quotes/{quoteId} {
      allow read, write: if isMember();
    }
    match /meta/{docId} {
      allow read, write: if isMember();
    }
  }
}
`;
}

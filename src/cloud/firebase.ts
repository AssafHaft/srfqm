/**
 * Thin wrapper around the Firebase SDK. Imported dynamically, so devices without a cloud config
 * never download Firebase.
 */
import { initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  runTransaction,
  setDoc,
  type DocumentData,
  type FirestoreError,
} from 'firebase/firestore';
import type { Quote } from '../model/types';
import type { CloudConfig } from './config';
import type { RemoteQuote } from './merge';

export interface CloudUser {
  email: string;
  verified: boolean;
}

export type SharedSettings = Record<string, unknown>;

function toRemote(id: string, d: DocumentData): RemoteQuote {
  return {
    id,
    updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : '',
    deleted: d.deleted === true,
    quote: d.deleted === true || !d.data ? null : (d.data as Quote),
  };
}

export function createCloud(config: CloudConfig) {
  const app = initializeApp(config.firebase, `srfqm-${config.firebase.projectId}`);
  const auth = getAuth(app);
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    ignoreUndefinedProperties: true,
  });
  if (config.emulator) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }

  const email = () => auth.currentUser?.email ?? '';

  return {
    onUser(cb: (user: CloudUser | null) => void): () => void {
      return onAuthStateChanged(auth, (u) => cb(u ? { email: u.email ?? '', verified: u.emailVerified } : null));
    },
    async signIn(mail: string, password: string): Promise<void> {
      await signInWithEmailAndPassword(auth, mail, password);
    },
    async signUp(mail: string, password: string): Promise<void> {
      const cred = await createUserWithEmailAndPassword(auth, mail, password);
      await sendEmailVerification(cred.user);
    },
    async resendVerification(): Promise<void> {
      if (auth.currentUser) await sendEmailVerification(auth.currentUser);
    },
    /** Re-reads the account after the user clicked the verification link. */
    async refreshUser(): Promise<CloudUser | null> {
      const u = auth.currentUser;
      if (!u) return null;
      await u.reload();
      await u.getIdToken(true);
      return { email: u.email ?? '', verified: u.emailVerified };
    },
    async resetPassword(mail: string): Promise<void> {
      await sendPasswordResetEmail(auth, mail);
    },
    async signOut(): Promise<void> {
      await signOut(auth);
    },

    /** First callback gets every document (for the initial merge), later ones individual changes from other devices. */
    watchQuotes(
      onInitial: (all: RemoteQuote[]) => void,
      onChange: (change: RemoteQuote) => void,
      onError: (err: FirestoreError) => void,
      onSyncState: (fromCache: boolean) => void,
    ): () => void {
      // The initial merge waits for the server's answer: merging against a possibly incomplete local cache
      // could upload stale copies over newer versions from other devices.
      let first = true;
      return onSnapshot(
        collection(db, 'quotes'),
        { includeMetadataChanges: true },
        (snap) => {
          onSyncState(snap.metadata.fromCache);
          if (first) {
            if (snap.metadata.fromCache) return;
            first = false;
            onInitial(snap.docs.map((d) => toRemote(d.id, d.data())));
            return;
          }
          for (const change of snap.docChanges()) {
            if (change.doc.metadata.hasPendingWrites || change.type === 'removed') continue;
            onChange(toRemote(change.doc.id, change.doc.data()));
          }
        },
        onError,
      );
    },
    async putQuote(q: Quote): Promise<void> {
      await setDoc(doc(db, 'quotes', q.id), { updatedAt: q.updatedAt, deleted: false, data: q, updatedBy: email() });
    },
    async deleteQuote(id: string, at: string): Promise<void> {
      await setDoc(doc(db, 'quotes', id), { updatedAt: at, deleted: true, data: null, updatedBy: email() });
    },

    /**
     * Takes the next number from the shared counter. `minSeq` is the lowest acceptable number (one above
     * the highest number already used), which also seeds a new or new-year counter.
     */
    async takeNumber(minSeq: number): Promise<{ year: number; seq: number }> {
      const ref = doc(db, 'meta', 'counter');
      const year = new Date().getFullYear();
      return runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        const d = snap.data();
        const counted = d && d.year === year && typeof d.next === 'number' ? d.next : 1;
        const seq = Math.max(counted, minSeq, 1);
        tx.set(ref, { year, next: seq + 1 });
        return { year, seq };
      });
    },

    watchSettings(cb: (s: SharedSettings | null, fromCache: boolean) => void, onError: (err: FirestoreError) => void): () => void {
      return onSnapshot(
        doc(db, 'meta', 'settings'),
        (snap) => {
          if (snap.metadata.hasPendingWrites) return;
          cb(snap.exists() ? (snap.data() as SharedSettings) : null, snap.metadata.fromCache);
        },
        onError,
      );
    },
    async putSettings(s: SharedSettings): Promise<void> {
      await setDoc(doc(db, 'meta', 'settings'), { ...s, updatedBy: email() });
    },

    watchMembers(cb: (emails: string[]) => void, onError: (err: FirestoreError) => void): () => void {
      return onSnapshot(collection(db, 'members'), (snap) => cb(snap.docs.map((d) => d.id).sort()), onError);
    },
    async addMember(mail: string): Promise<void> {
      await setDoc(doc(db, 'members', mail), { addedAt: new Date().toISOString(), addedBy: email() });
    },
    async removeMember(mail: string): Promise<void> {
      await deleteDoc(doc(db, 'members', mail));
    },
  };
}

export type CloudApi = ReturnType<typeof createCloud>;

import { describe, expect, it } from 'vitest';
import { buildRules, isCloudConfig, parseFirebaseConfig } from './config';

describe('parseFirebaseConfig', () => {
  it('reads the snippet exactly as the Firebase console shows it', () => {
    const snippet = `// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyA-example_Key-123",
  authDomain: "srfpark-quotes.firebaseapp.com",
  projectId: "srfpark-quotes",
  storageBucket: "srfpark-quotes.firebasestorage.app",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef123456"
};`;
    expect(parseFirebaseConfig(snippet)).toEqual({
      apiKey: 'AIzaSyA-example_Key-123',
      authDomain: 'srfpark-quotes.firebaseapp.com',
      projectId: 'srfpark-quotes',
      storageBucket: 'srfpark-quotes.firebasestorage.app',
      messagingSenderId: '1234567890',
      appId: '1:1234567890:web:abcdef123456',
    });
  });

  it('accepts JSON and rejects incomplete input', () => {
    expect(parseFirebaseConfig('{"apiKey":"k","authDomain":"d","projectId":"p","appId":"a"}')).toMatchObject({ projectId: 'p' });
    expect(parseFirebaseConfig('apiKey: "k", projectId: "p"')).toBeNull();
  });
});

describe('cloud config', () => {
  it('validates the published file and embeds the owner in the rules', () => {
    expect(isCloudConfig({ owner: 'a@b.co', firebase: { apiKey: 'k', authDomain: 'd', projectId: 'p', appId: 'a' } })).toBe(true);
    expect(isCloudConfig({ owner: 'a@b.co', firebase: { apiKey: 'k' } })).toBe(false);
    const rules = buildRules(' Owner@Example.com ');
    expect(rules).toContain("== 'owner@example.com'");
    expect(rules).toContain('match /quotes/{quoteId}');
  });
});

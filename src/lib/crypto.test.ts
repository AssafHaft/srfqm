import { describe, expect, it } from 'vitest';
import { base64ToText, decryptJson, encryptJson, isEncryptedFile, textToBase64, WrongPasswordError } from './crypto';

describe('catalog encryption', () => {
  const value = { catalog: { items: [{ name: 'שיעור גלישה', price: 150 }] } };

  it('round-trips with the right password and hides the content', async () => {
    const file = await encryptJson(value, 'גלים-2026', '2026-09-28T10:00:00.000Z');
    expect(isEncryptedFile(file)).toBe(true);
    expect(JSON.stringify(file)).not.toContain('150');
    expect(base64ToText(file.data)).not.toContain('שיעור');
    expect(await decryptJson(file, 'גלים-2026')).toEqual(value);
  });

  it('rejects a wrong password and a tampered file', async () => {
    const file = await encryptJson(value, 'right', 'x');
    await expect(decryptJson(file, 'wrong')).rejects.toBeInstanceOf(WrongPasswordError);
    const tampered = { ...file, data: file.data.slice(0, -4) + (file.data.endsWith('AAAA') ? 'BBBB' : 'AAAA') };
    await expect(decryptJson(tampered, 'right')).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it('encodes UTF-8 text for the GitHub API', () => {
    expect(base64ToText(textToBase64('קטלוג ₪150'))).toBe('קטלוג ₪150');
  });
});

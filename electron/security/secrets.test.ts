import { describe, expect, it, vi } from 'vitest';
import { safeStorage } from 'electron';
import { protectSecrets, revealSecrets, redactSecrets, omitSecrets } from './secrets.js';

describe('credential protection', () => {
  it('omits credentials from portable queue exports', () => {
    expect(
      omitSecrets({ opts: { url: 'https://example.com', cookie: 'private', password: 'secret' } })
    ).toEqual({ opts: { url: 'https://example.com' } });
  });
  it('encrypts nested credentials and migrates legacy plain strings', () => {
    const raw = {
      proxy: { password: 'secret' },
      siteLogins: [{ password: 'other' }],
      opts: { cookie: 'session=abc' },
      theme: 'dark',
    };
    const saved = protectSecrets(raw);
    expect(JSON.stringify(saved)).not.toContain('session=abc');
    expect(revealSecrets(saved)).toEqual(raw);
    expect(revealSecrets(raw)).toEqual(raw);
  });
  it('never falls back to plaintext when OS encryption is unavailable', () => {
    vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValueOnce(false);
    expect(() => protectSecrets({ password: 'private' })).toThrow();
  });
  it('removes credentials, raw arguments, signed query strings and URL passwords from logs', () => {
    const text = JSON.stringify(
      redactSecrets({
        password: 'secret',
        args: '--password private',
        url: 'https://user:pass@example.com/video?token=abc',
        nested: { cookie: 'session=abc' },
      })
    );
    for (const secret of ['secret', 'private', 'user:', 'pass@', 'token=abc', 'session=abc'])
      expect(text).not.toContain(secret);
  });
});

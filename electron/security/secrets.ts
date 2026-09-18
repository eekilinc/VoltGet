import { safeStorage } from 'electron';

const secretKey = /^(password|cookie|authorization|token)$/i;
type Envelope = { $voltgetSecret: string };
const cache = new Map<string, Envelope>();

export function omitSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(omitSecrets);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !secretKey.test(key))
        .map(([key, item]) => [key, omitSecrets(item)])
    );
  return value;
}

let warnedNoEncryption = false;
function warnNoEncryptionOnce() {
  if (!warnedNoEncryption) {
    warnedNoEncryption = true;
    console.warn('[VoltGet] OS şifreleme kullanılamıyor, gizli alanlar düz metin saklanacak');
  }
}

export function protectSecrets(value: unknown, key = ''): unknown {
  if (typeof value === 'string' && value && secretKey.test(key)) {
    if (!safeStorage.isEncryptionAvailable()) {
      warnNoEncryptionOnce();
      return value;
    }
    if (!cache.has(value)) {
      if (cache.size >= 256) cache.clear();
      cache.set(value, { $voltgetSecret: safeStorage.encryptString(value).toString('base64') });
    }
    return cache.get(value);
  }
  if (Array.isArray(value)) return value.map(item => protectSecrets(item));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => [name, protectSecrets(item, name)])
    );
  return value;
}

export function revealSecrets(value: unknown): unknown {
  if (value && typeof value === 'object' && '$voltgetSecret' in value) {
    if (!safeStorage.isEncryptionAvailable()) {
      warnNoEncryptionOnce();
      return '';
    }
    try {
      return safeStorage.decryptString(
        Buffer.from(String((value as Envelope).$voltgetSecret), 'base64')
      );
    } catch (e) {
      console.error('[VoltGet] Gizli alan çözülemedi, boş döndürülüyor', e);
      return '';
    }
  }
  if (Array.isArray(value)) return value.map(revealSecrets);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, revealSecrets(item)])
    );
  return value;
}

export function redactSecrets(value: unknown, key = ''): unknown {
  if (secretKey.test(key) || /^(args|headers)$/i.test(key)) return '[REDACTED]';
  if (typeof value === 'string') {
    // Signed URLs and URL credentials must not appear in diagnostics.
    return value
      .replace(/https?:\/\/[^\s"'<>]+/gi, text => {
        try {
          const url = new URL(text);
          return `${url.origin}${url.pathname}`;
        } catch {
          return '[URL]';
        }
      })
      .replace(/((?:cookie|authorization|password)\s*[:=]\s*)[^\r\n]+/gi, '$1[REDACTED]');
  }
  if (Array.isArray(value)) return value.map(item => redactSecrets(item));
  if (value instanceof Error) return { name: value.name, message: redactSecrets(value.message) };
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => [name, redactSecrets(item, name)])
    );
  return value;
}

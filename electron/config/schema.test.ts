import { describe, expect, it } from 'vitest';
import { mergeWithDefaults } from './schema.js';
describe('config recovery', () => {
  it('repairs invalid values without resetting valid siblings', () => {
    const cfg = mergeWithDefaults({
      language: 'en',
      customOutDir: 'D:/Downloads',
      concurrent: -3,
      proxy: { mode: 'manual', host: 'proxy.example', port: -1, password: 'private' },
      scheduler: { enabled: true, startTime: 'invalid', stopTime: '10:00' },
    });
    expect(cfg.concurrent).toBe(3);
    expect(cfg.language).toBe('en');
    expect(cfg.customOutDir).toBe('D:/Downloads');
    expect(cfg.proxy).toMatchObject({ host: 'proxy.example', port: 8080, password: 'private' });
    expect(cfg.scheduler).toMatchObject({ enabled: true, startTime: '02:00', stopTime: '10:00' });
  });
  it('keeps valid custom entries when another entry is invalid', () => {
    const cfg = mergeWithDefaults({
      language: 'de',
      siteLogins: [
        { id: 'good', host: 'example.com', username: 'u', password: 'p' },
        { id: 'bad', host: 4 },
      ],
    });
    expect(cfg.siteLogins).toHaveLength(1);
    expect(cfg.siteLogins[0].id).toBe('good');
    expect(cfg.language).toBe('de');
  });
  it('repairs invalid entries beyond the default array length', () => {
    const cfg = mergeWithDefaults({ scheduler: { days: [0, 1, 2, 3, 4, 5, 6, 99] } });
    expect(cfg.scheduler.days).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

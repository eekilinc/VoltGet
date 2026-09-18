import { z } from 'zod';

export const AppConfigSchema = z.object({
  concurrent: z.number().int().min(1).max(10).default(3),
  speedLimitKB: z.number().int().min(0).default(0),
  siteFolders: z.boolean().default(true),
  categoryFolders: z.boolean().default(false),
  filenameTemplate: z.string().default('%(title)s.%(ext)s'),
  autoUpdateCheck: z.boolean().default(true),
  sniffNotifications: z.boolean().default(true),
  sniffDebounceMs: z.number().int().min(1000).default(8000),
  theme: z.enum(['dark', 'light']).default('dark'),
  accentColor: z.enum(['blue', 'purple', 'green', 'orange', 'pink', 'red', 'teal']).default('blue'),
  language: z.enum(['tr', 'en', 'de', 'es', 'ru', 'ar']).default('tr'),
  interceptBrowserDownloads: z.boolean().default(true),
  captureMediaRequests: z.boolean().default(true),
  captureDocuments: z.boolean().default(true),
  captureArchives: z.boolean().default(true),
  captureInstallers: z.boolean().default(true),
  openAtLogin: z.boolean().default(false),
  startMinimized: z.boolean().default(false),
  closeToTray: z.boolean().default(true),
  minimizeToTray: z.boolean().default(false),
  clipboardWatcher: z.boolean().default(true),
  soundNotification: z.boolean().default(true),
  postDownloadAction: z.enum(['none', 'shutdown', 'sleep', 'quit']).default('none'),
  customOutDir: z.string().optional().default(''),
  // 1. Dosya çakışma politikası
  fileConflictAction: z.enum(['ask', 'resume', 'overwrite', 'rename', 'skip']).default('rename'),
  rememberConflictChoice: z.boolean().default(false),
  // 2. Bitirme diyaloğu
  completionDialog: z.boolean().default(true),
  // 3. Otomatik yeniden deneme
  autoRetryEnabled: z.boolean().default(true),
  maxAutoRetries: z.number().int().min(0).max(10).default(3),
  retryBaseDelaySec: z.number().int().min(1).max(300).default(5),
  // 6. Zamanlayıcı
  scheduler: z
    .object({
      enabled: z.boolean().default(false),
      startTime: z
        .string()
        .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
        .default('02:00'),
      stopTime: z
        .string()
        .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
        .default('07:00'),
      days: z.array(z.number().int().min(0).max(6)).default([0, 1, 2, 3, 4, 5, 6]),
      runOnceAt: z.string().default(''),
    })
    .default({
      enabled: false,
      startTime: '02:00',
      stopTime: '07:00',
      days: [0, 1, 2, 3, 4, 5, 6],
      runOnceAt: '',
    }),
  // 7. Proxy
  proxy: z
    .object({
      mode: z.enum(['system', 'none', 'manual', 'pac']).default('system'),
      host: z.string().default(''),
      port: z.number().int().min(1).max(65535).default(8080),
      username: z.string().default(''),
      password: z.string().default(''),
      pacUrl: z.string().default(''),
      bypass: z.string().default('localhost,127.0.0.1'),
    })
    .default({
      mode: 'system',
      host: '',
      port: 8080,
      username: '',
      password: '',
      pacUrl: '',
      bypass: 'localhost,127.0.0.1',
    }),
  // 8. Site girişleri
  siteLogins: z
    .array(
      z.object({
        id: z.string(),
        host: z.string(),
        username: z.string(),
        password: z.string(),
      })
    )
    .default([]),
  cookiesFromBrowser: z
    .enum(['none', 'chrome', 'edge', 'firefox', 'brave', 'opera'])
    .default('none'),
  // 9. Bağlantı ayarları
  partsCount: z.number().int().min(1).max(16).default(8),
  ytDlpFragments: z.number().int().min(1).max(32).default(16),
  requestTimeoutMs: z.number().int().min(5000).max(300000).default(30000),
  // 10. Virüs taraması
  virusScanEnabled: z.boolean().default(false),
  // 12. Özel kategoriler
  customCategories: z
    .array(
      z.object({
        name: z.string(),
        extensions: z.array(z.string()),
      })
    )
    .default([]),
  // 13. Otomatik güncelleme
  appAutoUpdate: z.boolean().default(true),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

export function validateConfig(config: unknown): {
  success: boolean;
  data?: AppConfig;
  error?: string;
} {
  const result = AppConfigSchema.safeParse(config);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error.message };
}

export function mergeWithDefaults(config: unknown): AppConfig {
  const defaults = AppConfigSchema.parse({});
  if (!config || typeof config !== 'object' || Array.isArray(config)) return defaults;
  const candidate = structuredClone(config) as Record<string, unknown>;
  // Repair only invalid leaves. Nested valid preferences survive a malformed sibling.
  for (;;) {
    const result = AppConfigSchema.safeParse(candidate);
    if (result.success) return result.data;
    for (const issue of result.error.issues.slice(0, 1)) {
      const keys = issue.path.filter((key): key is string | number => typeof key !== 'symbol');
      if (!keys.length) return defaults;
      let target: Record<string, unknown> = candidate;
      let fallback: unknown = defaults;
      for (let i = 0; i < keys.length - 1; i++) {
        const key = String(keys[i]);
        if (!target[key] || typeof target[key] !== 'object') break;
        target = target[key] as Record<string, unknown>;
        fallback =
          fallback && typeof fallback === 'object'
            ? (fallback as Record<string, unknown>)[key]
            : undefined;
      }
      const leaf = String(keys[keys.length - 1]);
      const replacement =
        fallback && typeof fallback === 'object'
          ? (fallback as Record<string, unknown>)[leaf]
          : undefined;
      if (replacement !== undefined) target[leaf] = structuredClone(replacement);
      else {
        // Invalid custom list entries have no defaults; remove only that entry.
        const arrayKey = String(keys[0]);
        if (Array.isArray(target)) {
          target.splice(Number(leaf), 1);
        } else if (Array.isArray(candidate[arrayKey]) && typeof keys[1] === 'number') {
          (candidate[arrayKey] as unknown[]).splice(keys[1], 1);
        } else delete target[leaf];
      }
    }
  }
}

export const defaultConfig = AppConfigSchema.parse({});

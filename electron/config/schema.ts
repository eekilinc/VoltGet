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
  const result = AppConfigSchema.safeParse(config);
  if (result.success) {
    return result.data;
  }
  return AppConfigSchema.parse({});
}

export const defaultConfig = AppConfigSchema.parse({});

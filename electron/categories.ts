import { loadConfig } from './store.js';
import { getCategoryFromExt } from './utils/files.js';

export interface CustomCategory {
  name: string;
  extensions: string[];
}

/** Özel kategori önce, yoksa yerleşik eşleşme. Özel isimler aynen döner. */
export function categorizeFile(extWithOrWithoutDot: string): string {
  const ext = (extWithOrWithoutDot || '').replace(/^\./, '').toLowerCase();
  if (!ext) return 'other';
  try {
    const cfg = loadConfig() as any;
    const customs: CustomCategory[] = cfg?.customCategories || [];
    for (const c of customs) {
      if (!c?.name) continue;
      const exts = (c.extensions || []).map(e => String(e).replace(/^\./, '').toLowerCase());
      if (exts.includes(ext)) return c.name;
    }
  } catch {}
  return getCategoryFromExt(ext);
}

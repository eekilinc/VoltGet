export type Lang = 'tr' | 'en' | 'de' | 'es' | 'ru' | 'ar';

export const LANGS: Record<Lang, string> = {
  tr: 'Türkçe',
  en: 'English',
  de: 'Deutsch',
  es: 'Español',
  ru: 'Русский',
  ar: 'العربية',
};

import tr from './locales/tr.json';
import en from './locales/en.json';
import de from './locales/de.json';
import es from './locales/es.json';
import ru from './locales/ru.json';
import ar from './locales/ar.json';

const dict: Record<Lang, Record<string, string>> = { tr, en, de, es, ru, ar };

export function t(lang: Lang, key: string): string {
  return dict[lang]?.[key] ?? dict.tr[key] ?? dict.en[key] ?? key;
}

export function getDict(lang: Lang): Record<string, string> {
  return dict[lang] ?? dict.tr;
}

export function hasKey(key: string): boolean {
  return key in dict.en;
}

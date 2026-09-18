/** Medya yakalama + kuyruk rozetleri için paylaşılan dosya tipi eşleşmesi. */
export const GENERIC_FILE_RE =
  /\.(zip|rar|7z|gz|tar|iso|exe|msi|apk|dmg|pdf|doc|docx|xls|xlsx|ppt|pptx|epub|torrent)($|\?)/i;

const GENERIC_TYPE_NAMES = new Set([
  'zip',
  'rar',
  '7z',
  'pdf',
  'exe',
  'msi',
  'apk',
  'dmg',
  'doc',
  'xls',
  'ppt',
  'torrent',
  'file',
]);

export function isGenericFileUrl(url: string, type?: string): boolean {
  if (!url) return false;
  return GENERIC_FILE_RE.test(url) || GENERIC_TYPE_NAMES.has((type || '').toLowerCase());
}

export function isMultiSegmentUrl(url: string, fileName?: string): boolean {
  const target = `${url || ''} ${fileName || ''}`.trim();
  return GENERIC_FILE_RE.test(target);
}

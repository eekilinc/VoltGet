import { buildDefaultSniffFormats } from './sniff.js';

const GENERIC_RE =
  /\.(zip|rar|7z|gz|tar|iso|exe|msi|apk|dmg|pdf|doc|docx|xls|xlsx|ppt|pptx|epub|torrent)($|\?)/i;

export function isGenericDownload(
  resolvedUrl: string,
  filename: string | undefined,
  flags: { isGenericDownload?: boolean; type?: string }
): boolean {
  return (
    GENERIC_RE.test(resolvedUrl) ||
    (!!filename && GENERIC_RE.test(filename)) ||
    !!flags.isGenericDownload ||
    flags.type === 'file'
  );
}

export interface DialogSeed {
  url: string;
  formats: Array<{ id: string; resolution: string; ext: string; note: string }>;
  selectedFormat: string;
  title: string;
  loading: boolean;
}

export function buildInitialDialogData(data: any, resolvedUrl: string, isGen: boolean): any {
  const initialTitle =
    data.filename ||
    data.title ||
    resolvedUrl.split('/').pop()?.split('?')[0] ||
    (isGen ? 'Dosya' : 'Video');
  const defaultFormats = buildDefaultSniffFormats(isGen, resolvedUrl.endsWith('.pdf'));
  return {
    ...data,
    url: resolvedUrl,
    formats: defaultFormats,
    selectedFormat: data.asAudio ? 'bestaudio/best' : 'best',
    title: initialTitle,
    loading: !isGen && !resolvedUrl.endsWith('.pdf'),
  };
}

export function pickAnalyzeTarget(
  resolvedUrl: string,
  pageUrl?: string
): { target: string; waitTime: number; isYT: boolean } {
  const isYT =
    /youtube\.com|youtu\.be|googlevideo\.com/i.test(resolvedUrl) ||
    (!!pageUrl && /youtube\.com|youtu\.be/i.test(pageUrl));
  const target = isYT && pageUrl && /youtube\.com|youtu\.be/i.test(pageUrl) ? pageUrl : resolvedUrl;
  return { target, waitTime: isYT ? 10000 : 3500, isYT };
}

export function mergeAnalyzedIntoDialog(initialData: any, res: any, asAudio?: boolean): any {
  const defaultFormats = initialData.formats || [];
  const enrichedFormats = res?.formats && res.formats.length > 0 ? res.formats : defaultFormats;
  return {
    ...initialData,
    ...(res || {}),
    formats: enrichedFormats,
    selectedFormat: asAudio
      ? enrichedFormats.find((f: any) => f.isAudioOnly)?.id || 'bestaudio/best'
      : enrichedFormats[0]?.id || 'best',
    loading: false,
  };
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

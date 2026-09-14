import { useCallback, useEffect, useMemo, useState } from 'react';
import { playDownloadCompleteChime } from '../utils/audio';
import { calcTotalSpeed } from '../utils/speed';

export type Job = {
  id: string;
  url: string;
  title: string;
  percent: number;
  speed: string;
  eta: string;
  total: string;
  status: 'downloading' | 'done' | 'error' | 'queued' | 'paused';
  log: string;
  opts?: any;
  filePath?: string;
  fileName?: string;
  deletedFromDisk?: boolean;
};

declare global {
  interface Window {
    api: any;
  }
}

function resolveFilePath(j: any): string {
  return (
    j.filePath ||
    j.opts?.outPath ||
    (j.opts?.filename && j.opts?.outDir ? `${j.opts.outDir}\\${j.opts.filename}` : '')
  );
}

export function useJobs(hasApi: boolean) {
  const [jobs, setJobs] = useState<Job[]>([]);

  useEffect(() => {
    if (!hasApi) return;
    window.api.getQueue().then(async (saved: any[]) => {
      if (saved?.length) {
        const seenIds = new Set<string>();
        const uniqueSaved = saved.filter((j: any) => {
          if (!j?.id || seenIds.has(j.id)) return false;
          seenIds.add(j.id);
          return true;
        });
        const initialJobs = uniqueSaved
          .filter((j: any) => j.status === 'done' || j.status === 'error' || j.status === 'paused')
          .slice(0, 30);
        const verifiedJobs = await Promise.all(
          initialJobs.map(async (j: any) => {
            const fp = resolveFilePath(j);
            if (j.status === 'done' && fp && window.api?.checkFileExists) {
              try {
                const exists = await window.api.checkFileExists(fp);
                return { ...j, filePath: fp, deletedFromDisk: !exists };
              } catch {}
            }
            return { ...j, filePath: fp || j.filePath };
          })
        );
        setJobs(verifiedJobs);
      }
    });
  }, [hasApi]);

  useEffect(() => {
    if (!hasApi) return;
    const onP = (d: any) => {
      setJobs(j => {
        const exists = j.some(x => x.id === d.id);
        if (!exists) {
          const newJob: Job = {
            id: d.id,
            url: d.url || '',
            title: d.title || 'İndiriliyor...',
            percent: d.percent || 0,
            speed: d.speed || '-',
            eta: d.eta || '-',
            total: d.total || '',
            status: 'downloading',
            log: d.raw || 'İndiriliyor...',
          };
          const n = [newJob, ...j];
          window.api.saveQueue(n);
          return n;
        }
        const n = j.map(x =>
          x.id === d.id
            ? {
                ...x,
                title:
                  (x.title === 'İndiriliyor...' || x.title === 'İndirme') && d.title
                    ? d.title
                    : x.title,
                percent: d.percent,
                speed: d.speed,
                eta: d.eta,
                total: d.total || x.total,
                log: d.raw,
                status: 'downloading' as Job['status'],
              }
            : x
        );
        window.api.saveQueue(n);
        return n;
      });
    };
    const onD = (d: any) =>
      setJobs(j => {
        if (d.code === 0) {
          window.api
            .getConfig?.()
            .then((cfg: any) => {
              if (cfg?.soundNotification !== false) playDownloadCompleteChime();
            })
            .catch(() => playDownloadCompleteChime());
        }
        const n = j.map(x =>
          x.id === d.id
            ? {
                ...x,
                status: (d.code === 0 ? 'done' : 'error') as Job['status'],
                percent: d.code === 0 ? 100 : x.percent,
                log: d.code === 0 ? 'Tamamlandı ✓' : x.log,
                filePath: d.filePath || x.filePath || x.opts?.outPath,
                fileName: d.fileName || x.fileName || x.opts?.filename,
                deletedFromDisk: false,
              }
            : x
        );
        window.api.saveQueue(n);
        return n;
      });
    const onE = (d: any) =>
      setJobs(j => {
        const n = j.map(x =>
          x.id === d.id ? { ...x, status: 'error' as Job['status'], log: d.error } : x
        );
        window.api.saveQueue(n);
        return n;
      });
    const onL = (d: any) => setJobs(j => j.map(x => (x.id === d.id ? { ...x, log: d.text } : x)));
    const onQ = (d: any) => {
      setJobs(j => {
        const exists = j.some(x => x.id === d.id);
        if (exists) {
          const n = j.map(x =>
            x.id === d.id ? { ...x, status: 'queued' as const, log: `Sırada #${d.position}` } : x
          );
          window.api.saveQueue(n);
          return n;
        }
        const title = d.opts?.title || d.opts?.filename || d.opts?.url || 'İndirme';
        const newJob: Job = {
          id: d.id,
          url: d.opts?.url || '',
          title: title.slice(0, 70),
          percent: 0,
          speed: '-',
          eta: '-',
          total: '',
          status: 'queued',
          log: `Sırada #${d.position}`,
          opts: d.opts,
        };
        const n = [newJob, ...j];
        window.api.saveQueue(n);
        return n;
      });
    };
    const onS = (d: any) => {
      setJobs(j => {
        const title = d.opts?.title || d.opts?.filename || d.opts?.url || 'İndirme';
        const exists = j.some(x => x.id === d.id);
        if (exists) {
          const n = j.map(x =>
            x.id === d.id
              ? {
                  ...x,
                  title:
                    title !== 'İndiriliyor...' && title !== 'İndirme'
                      ? title.slice(0, 70)
                      : x.title,
                  status: 'downloading' as const,
                  log: 'Başlatıldı...',
                  opts: d.opts || x.opts,
                }
              : x
          );
          window.api.saveQueue(n);
          return n;
        }
        const newJob: Job = {
          id: d.id,
          url: d.opts?.url || '',
          title: title.slice(0, 70),
          percent: 0,
          speed: '-',
          eta: '-',
          total: '',
          status: 'downloading',
          log: 'Başlatıldı...',
          opts: d.opts,
        };
        const n = [newJob, ...j];
        window.api.saveQueue(n);
        return n;
      });
    };
    const onC = (d: any) => setJobs(j => j.filter(x => x.id !== d.id));
    const onPaused = (d: any) =>
      setJobs(j => {
        const n = j.map(x =>
          x.id === d.id ? { ...x, status: 'paused' as const, log: 'Duraklatıldı' } : x
        );
        window.api.saveQueue(n);
        return n;
      });

    window.api.onProgress(onP);
    window.api.onDone(onD);
    window.api.onError(onE);
    window.api.onLog(onL);
    window.api.onQueued(onQ);
    window.api.onStarted(onS);
    window.api.onCanceled(onC);
    window.api.onPaused?.(onPaused);
    return () => {};
  }, [hasApi]);

  const totalSpeed = useMemo(() => calcTotalSpeed(jobs), [jobs]);
  const activeCount = useMemo(
    () => jobs.filter(j => j.status === 'downloading' || j.status === 'queued').length,
    [jobs]
  );

  const pushJob = useCallback((job: Job) => {
    setJobs(j => {
      if (j.some(x => x.id === job.id)) {
        return j.map(x => (x.id === job.id ? { ...x, ...job } : x));
      }
      const n = [job, ...j];
      window.api.saveQueue(n);
      return n;
    });
  }, []);

  const handleStartDownload = useCallback(
    async (opts: any) => {
      const url = opts.url as string;
      const title = opts.title || url.slice(0, 50);
      const res = await window.api.startDownload(opts);
      const id = res.id;
      const queued = !!res.queued;
      pushJob({
        id,
        url,
        title,
        percent: 0,
        speed: '-',
        eta: '-',
        total: '',
        status: queued ? 'queued' : 'downloading',
        log: queued ? `Sırada #${res.position || '?'}` : 'Başlatıldı...',
        opts,
      } as Job);
      return id;
    },
    [pushJob]
  );

  const handleDirectDownload = useCallback(
    async (opts: any) => {
      const res = await window.api.directDownload(opts);
      const id = res.id as string;
      const queued = !!res.queued;
      pushJob({
        id,
        url: opts.url,
        title: opts.url.slice(0, 50),
        percent: 0,
        speed: '-',
        eta: '-',
        total: '',
        status: queued ? 'queued' : 'downloading',
        log: queued ? 'Sırada…' : 'Direkt indiriliyor...',
        opts,
      } as Job);
      return id;
    },
    [pushJob]
  );

  const handleHttpDownload = useCallback(
    async (opts: any) => {
      const res = await window.api.httpDownload(opts);
      const id = res.id as string;
      const queued = !!res.queued;
      const title = opts.filename || opts.url.slice(0, 50);
      pushJob({
        id,
        url: opts.url,
        title,
        percent: 0,
        speed: '-',
        eta: '-',
        total: '',
        status: queued ? 'queued' : 'downloading',
        log: queued ? 'Sırada…' : 'İndiriliyor...',
        opts,
      } as Job);
      return id;
    },
    [pushJob]
  );

  const handleRetry = useCallback(async (job: Job) => {
    if (!job.opts) return;
    const res = await window.api.retryDownload(job.opts);
    const id = res.id;
    setJobs(j => {
      const filtered = j.filter(x => x.id !== job.id);
      if (filtered.some(x => x.id === id)) return filtered;
      const queued = !!res.queued;
      const newJob: Job = {
        id,
        url: job.url,
        title: job.title,
        percent: 0,
        speed: '-',
        eta: '-',
        total: '',
        status: queued ? 'queued' : 'downloading',
        log: queued ? 'Sırada…' : 'Yeniden başlatıldı...',
        opts: job.opts,
      };
      const n = [newJob, ...filtered];
      window.api.saveQueue(n);
      return n;
    });
  }, []);

  const persistQueue = useCallback((n: Job[]) => {
    try {
      window.api?.saveQueue?.(n);
    } catch {}
  }, []);

  const handleRemoveJob = useCallback(
    async (id: string) => {
      try {
        await window.api?.removeFromHistory?.(id);
      } catch {}
      setJobs(j => {
        const n = j.filter(x => x.id !== id);
        persistQueue(n);
        return n;
      });
    },
    [persistQueue]
  );

  const handleDeleteJob = useCallback(
    async (job: Job, deleteFromDisk: boolean) => {
      const targetPath = job.filePath || job.opts?.outPath;
      try {
        await window.api?.deleteFile?.({ filePath: targetPath, deleteFromDisk, id: job.id });
      } catch {}
      setJobs(j => {
        const n = j.filter(x => x.id !== job.id);
        persistQueue(n);
        return n;
      });
    },
    [persistQueue]
  );

  return {
    jobs,
    setJobs,
    totalSpeed,
    activeCount,
    handleStartDownload,
    handleDirectDownload,
    handleHttpDownload,
    handleRetry,
    handleRemoveJob,
    handleDeleteJob,
  };
}

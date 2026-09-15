import { useMemo, useState } from 'react';
import type { Job } from '../components/QueuePanel';

export type JobFilterTab = 'all' | 'downloading' | 'done' | 'paused' | 'error';
export type JobCategory = 'all' | 'video' | 'audio' | 'document' | 'archive' | 'program';

export function getJobCategory(j: Job): JobCategory {
  if (j.opts?.asAudio) return 'audio';
  const raw = (j.fileName || j.filePath || j.url || '').split('?')[0].toLowerCase();
  const ext = raw.split('.').pop() || '';

  if (['mp3', 'm4a', 'aac', 'flac', 'wav', 'ogg', 'opus', 'wma'].includes(ext)) return 'audio';
  if (['mp4', 'mkv', 'webm', 'avi', 'mov', 'flv', 'ts', 'm3u8', 'wmv'].includes(ext))
    return 'video';
  if (
    ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'epub', 'rtf', 'csv'].includes(ext)
  )
    return 'document';
  if (['zip', 'rar', '7z', 'tar', 'gz', 'iso', 'bz2', 'tgz', 'xz'].includes(ext)) return 'archive';
  if (['exe', 'msi', 'apk', 'dmg', 'deb', 'rpm', 'pkg', 'bin'].includes(ext)) return 'program';

  if (j.opts?.formatId || (!j.opts?.isHttp && !j.opts?.asAudio)) return 'video';

  return 'video';
}

export function useJobFilter(jobs: Job[]) {
  const [filterTab, setFilterTab] = useState<JobFilterTab>('all');
  const [categoryFilter, setCategoryFilter] = useState<JobCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const counts = useMemo(() => {
    return {
      all: jobs.length,
      downloading: jobs.filter(j => j.status === 'downloading' || j.status === 'queued').length,
      done: jobs.filter(j => j.status === 'done').length,
      doneVisible: jobs.filter(j => j.status === 'done' && !j.deletedFromDisk).length,
      paused: jobs.filter(j => j.status === 'paused').length,
      error: jobs.filter(j => j.status === 'error').length,
      deletedFromDisk: jobs.filter(j => j.status === 'done' && j.deletedFromDisk).length,
    };
  }, [jobs]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return jobs.filter(j => {
      if (filterTab === 'downloading' && !(j.status === 'downloading' || j.status === 'queued'))
        return false;
      if (filterTab !== 'all' && filterTab !== 'downloading' && j.status !== filterTab)
        return false;
      if (categoryFilter !== 'all' && getJobCategory(j) !== categoryFilter) return false;
      if (q) {
        const matchTitle = j.title?.toLowerCase().includes(q);
        const matchUrl = j.url?.toLowerCase().includes(q);
        const matchFile = j.fileName?.toLowerCase().includes(q);
        if (!matchTitle && !matchUrl && !matchFile) return false;
      }
      return true;
    });
  }, [jobs, filterTab, categoryFilter, searchQuery]);

  return {
    filterTab,
    setFilterTab,
    categoryFilter,
    setCategoryFilter,
    searchQuery,
    setSearchQuery,
    counts,
    filtered,
  };
}

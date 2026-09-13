import { useMemo, useState } from 'react';
import type { Job } from '../components/QueuePanel';

export type JobFilterTab = 'all' | 'downloading' | 'done' | 'paused' | 'error';

export function useJobFilter(jobs: Job[]) {
  const [filterTab, setFilterTab] = useState<JobFilterTab>('all');
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
      if (q) {
        const matchTitle = j.title?.toLowerCase().includes(q);
        const matchUrl = j.url?.toLowerCase().includes(q);
        const matchFile = j.fileName?.toLowerCase().includes(q);
        if (!matchTitle && !matchUrl && !matchFile) return false;
      }
      return true;
    });
  }, [jobs, filterTab, searchQuery]);

  return { filterTab, setFilterTab, searchQuery, setSearchQuery, counts, filtered };
}

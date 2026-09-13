import { useMemo } from 'react';
import { isTemporaryOrPartialFile } from '../utils/files-client';
import type { DownloadedFile } from '../components/FileExplorer';

export type FileStatusFilter = 'all' | 'existing' | 'deleted';
export type FileCategoryFilter = 'all' | 'video' | 'audio' | 'document' | 'archive' | 'installer';
export type FileSort = 'date_desc' | 'date_asc' | 'size_desc' | 'size_asc' | 'name_asc';

export function useFileList(
  files: DownloadedFile[],
  opts: {
    statusFilter: FileStatusFilter;
    category: FileCategoryFilter;
    search: string;
    sort: FileSort;
  }
) {
  const filteredFiles = useMemo(() => {
    return files
      .filter(f => {
        if (isTemporaryOrPartialFile(f.name)) return false;
        if (opts.statusFilter === 'existing' && f.deletedFromDisk) return false;
        if (opts.statusFilter === 'deleted' && !f.deletedFromDisk) return false;
        if (opts.category !== 'all' && f.category !== opts.category) return false;
        if (opts.search.trim()) {
          const q = opts.search.toLowerCase();
          return (
            f.name.toLowerCase().includes(q) || (f.folder && f.folder.toLowerCase().includes(q))
          );
        }
        return true;
      })
      .sort((a, b) => {
        switch (opts.sort) {
          case 'date_desc':
            return (b.mtime || 0) - (a.mtime || 0);
          case 'date_asc':
            return (a.mtime || 0) - (b.mtime || 0);
          case 'size_desc':
            return b.size - a.size;
          case 'size_asc':
            return a.size - b.size;
          case 'name_asc':
            return a.name.localeCompare(b.name);
          default:
            return 0;
        }
      });
  }, [files, opts.statusFilter, opts.category, opts.search, opts.sort]);

  const totalBytes = useMemo(() => {
    return filteredFiles.filter(f => !f.deletedFromDisk).reduce((acc, f) => acc + f.size, 0);
  }, [filteredFiles]);

  const counts = useMemo(() => {
    return {
      all: files.length,
      existing: files.filter(f => !f.deletedFromDisk).length,
      deleted: files.filter(f => f.deletedFromDisk).length,
    };
  }, [files]);

  return { filteredFiles, totalBytes, counts };
}

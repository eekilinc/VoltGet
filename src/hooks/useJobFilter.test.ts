import { describe, it, expect } from 'vitest';
import { getJobCategory } from './useJobFilter';
import type { Job } from '../components/QueuePanel';

describe('getJobCategory', () => {
  it('correctly classifies video files', () => {
    const job: Job = {
      id: '1',
      url: 'https://example.com/movie.mp4',
      title: 'Movie',
      percent: 100,
      speed: '',
      eta: '',
      total: '',
      status: 'done',
      log: '',
    };
    expect(getJobCategory(job)).toBe('video');
  });

  it('correctly classifies audio files or asAudio options', () => {
    const job1: Job = {
      id: '2',
      url: 'https://example.com/song.mp3',
      title: 'Song',
      percent: 50,
      speed: '',
      eta: '',
      total: '',
      status: 'downloading',
      log: '',
    };
    expect(getJobCategory(job1)).toBe('audio');

    const job2: Job = {
      id: '3',
      url: 'https://youtube.com/watch?v=123',
      title: 'YouTube Audio',
      percent: 0,
      speed: '',
      eta: '',
      total: '',
      status: 'queued',
      log: '',
      opts: { asAudio: true },
    };
    expect(getJobCategory(job2)).toBe('audio');
  });

  it('correctly classifies archives, documents and programs', () => {
    const zipJob: Job = {
      id: '4',
      url: 'https://example.com/file.zip',
      title: 'Archive',
      percent: 100,
      speed: '',
      eta: '',
      total: '',
      status: 'done',
      log: '',
    };
    expect(getJobCategory(zipJob)).toBe('archive');

    const docJob: Job = {
      id: '5',
      url: 'https://example.com/guide.pdf',
      title: 'Manual',
      percent: 100,
      speed: '',
      eta: '',
      total: '',
      status: 'done',
      log: '',
    };
    expect(getJobCategory(docJob)).toBe('document');

    const progJob: Job = {
      id: '6',
      url: 'https://example.com/setup.exe',
      title: 'Installer',
      percent: 100,
      speed: '',
      eta: '',
      total: '',
      status: 'done',
      log: '',
    };
    expect(getJobCategory(progJob)).toBe('program');
  });
});

import { describe, expect, it, vi } from 'vitest';

const { instances, FakeNotification } = vi.hoisted(() => {
  const list: any[] = [];
  class MockNotification {
    opts: any;
    shown = false;
    private listeners = new Map<string, Array<() => void>>();
    static isSupported = () => true;
    constructor(opts: any) {
      this.opts = opts;
      list.push(this);
    }
    on(event: string, fn: () => void) {
      const arr = this.listeners.get(event) || [];
      arr.push(fn);
      this.listeners.set(event, arr);
      return this;
    }
    emit(event: string) {
      for (const fn of this.listeners.get(event) || []) fn();
    }
    show() {
      this.shown = true;
    }
  }
  return { instances: list, FakeNotification: MockNotification };
});

vi.mock('electron', () => ({
  Notification: FakeNotification,
}));

import { createNotificationHelper } from './notifications.js';

describe('createNotificationHelper', () => {
  it('focuses and restores main window and switches tab on click', () => {
    instances.length = 0;
    const send = vi.fn();
    const restore = vi.fn();
    const show = vi.fn();
    const moveTop = vi.fn();
    const focus = vi.fn();
    const setAlwaysOnTop = vi.fn();

    const fakeWindow: any = {
      isDestroyed: () => false,
      isMinimized: () => true,
      isVisible: () => false,
      isAlwaysOnTop: () => false,
      restore,
      show,
      moveTop,
      focus,
      setAlwaysOnTop,
      webContents: {
        isDestroyed: () => false,
        send,
      },
    };

    const helper = createNotificationHelper({
      getMainWindow: () => fakeWindow,
      getAppIconPath: () => 'assets/icon.ico',
    });

    const n = helper.showNotification('İndirme bitti', 'dosya.mp4', { jobId: 'job-42' });
    expect(n).not.toBeNull();
    expect(helper.getActiveCount()).toBe(1);
    expect(instances[0].shown).toBe(true);
    expect(instances[0].opts.icon).toBe('assets/icon.ico');

    instances[0].emit('click');

    expect(restore).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledTimes(1);
    expect(moveTop).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('switch-to-download-tab', { jobId: 'job-42' });
    expect(helper.getActiveCount()).toBe(0);
  });

  it('cleans up active reference on close event', () => {
    instances.length = 0;
    const helper = createNotificationHelper({
      getMainWindow: () => null,
    });
    helper.showNotification('Test', 'Body');
    expect(helper.getActiveCount()).toBe(1);
    instances[0].emit('close');
    expect(helper.getActiveCount()).toBe(0);
  });
});

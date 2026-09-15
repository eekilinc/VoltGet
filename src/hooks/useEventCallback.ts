import { useCallback, useLayoutEffect, useRef } from 'react';

/** Stable subscription callback that always sees the latest committed UI state. */
export function useEventCallback<Args extends unknown[], Result>(
  callback: (...args: Args) => Result
) {
  const ref = useRef(callback);
  useLayoutEffect(() => {
    ref.current = callback;
  });
  return useCallback((...args: Args) => ref.current(...args), []);
}

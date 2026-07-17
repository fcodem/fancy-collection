"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Debounced fetch with AbortController — ignores stale responses.
 */
export function useAbortableSearch(debounceMs = 200) {
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);
  const inflightRef = useRef<Map<string, Promise<unknown>>>(new Map());

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
    },
    [],
  );

  const run = useCallback(
    async <T,>(
      key: string,
      fetcher: (signal: AbortSignal) => Promise<T>,
      opts?: { debounce?: boolean },
    ): Promise<T | null> => {
      const seq = ++seqRef.current;

      const execute = async (): Promise<T | null> => {
        const existing = inflightRef.current.get(key) as Promise<T> | undefined;
        if (existing) {
          try {
            const v = await existing;
            return seq === seqRef.current ? v : null;
          } catch {
            return null;
          }
        }

        abortRef.current?.abort();
        const ac = new AbortController();
        abortRef.current = ac;

        const promise = fetcher(ac.signal).finally(() => {
          inflightRef.current.delete(key);
        });
        inflightRef.current.set(key, promise);

        try {
          const value = await promise;
          if (seq !== seqRef.current || ac.signal.aborted) return null;
          return value;
        } catch (e) {
          if (ac.signal.aborted) return null;
          throw e;
        }
      };

      if (opts?.debounce === false) {
        return execute();
      }

      return new Promise<T | null>((resolve, reject) => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          execute().then(resolve, reject);
        }, debounceMs);
      });
    },
    [debounceMs],
  );

  const abort = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    abortRef.current?.abort();
    seqRef.current += 1;
  }, []);

  return { run, abort };
}

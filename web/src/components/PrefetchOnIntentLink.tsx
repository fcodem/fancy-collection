"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  type ComponentProps,
  type FocusEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

type PrefetchOnIntentLinkProps = Omit<ComponentProps<typeof Link>, "prefetch"> & {
  children: ReactNode;
  /** Hover/focus dwell before prefetch (ms). */
  intentMs?: number;
};

const MAX_CONCURRENT = 2;
let inflight = 0;
const queued: Array<() => void> = [];

function runPrefetch(fn: () => void) {
  if (inflight >= MAX_CONCURRENT) {
    queued.push(fn);
    return;
  }
  inflight += 1;
  try {
    fn();
  } finally {
    // next/link prefetch is sync schedule — release on next tick
    setTimeout(() => {
      inflight = Math.max(0, inflight - 1);
      const next = queued.shift();
      if (next) runPrefetch(next);
    }, 0);
  }
}

function shouldSkipIntentPrefetch(skipCoarsePointer = true): boolean {
  if (typeof navigator === "undefined") return true;
  const conn = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  if (conn?.saveData) return true;
  const et = conn?.effectiveType || "";
  if (et === "slow-2g" || et === "2g") return true;
  // Touch / coarse pointer: avoid prefetch storms on scroll
  if (
    skipCoarsePointer &&
    typeof window !== "undefined" &&
    window.matchMedia("(pointer: coarse)").matches
  ) {
    return true;
  }
  return false;
}

/**
 * Next.js Link that does NOT prefetch on visibility.
 * Prefetches one route only after sustained hover/focus (~150ms).
 */
export default function PrefetchOnIntentLink({
  href,
  children,
  intentMs = 150,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  onPointerDown,
  ...rest
}: PrefetchOnIntentLinkProps) {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doneRef = useRef(false);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => () => clear(), [clear]);

  const schedule = useCallback(() => {
    if (doneRef.current || shouldSkipIntentPrefetch()) return;
    clear();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      doneRef.current = true;
      const path = typeof href === "string" ? href : href.pathname || "";
      if (!path) return;
      runPrefetch(() => {
        try {
          router.prefetch(path);
        } catch {
          /* ignore */
        }
      });
    }, intentMs);
  }, [clear, href, intentMs, router]);

  const prefetchNow = useCallback(() => {
    if (doneRef.current || shouldSkipIntentPrefetch(false)) return;
    clear();
    doneRef.current = true;
    const path = typeof href === "string" ? href : href.pathname || "";
    if (!path) return;
    runPrefetch(() => {
      try {
        router.prefetch(path);
      } catch {
        /* navigation still proceeds */
      }
    });
  }, [clear, href, router]);

  return (
    <Link
      href={href}
      prefetch={false}
      onMouseEnter={(e: MouseEvent<HTMLAnchorElement>) => {
        onMouseEnter?.(e);
        schedule();
      }}
      onMouseLeave={(e: MouseEvent<HTMLAnchorElement>) => {
        onMouseLeave?.(e);
        clear();
      }}
      onFocus={(e: FocusEvent<HTMLAnchorElement>) => {
        onFocus?.(e);
        schedule();
      }}
      onBlur={(e: FocusEvent<HTMLAnchorElement>) => {
        onBlur?.(e);
        clear();
      }}
      onPointerDown={(e: PointerEvent<HTMLAnchorElement>) => {
        onPointerDown?.(e);
        // Touch devices have no hover dwell. Start the RSC request at pointer-down
        // so the following click can reuse it instead of beginning from zero.
        prefetchNow();
      }}
      {...rest}
    >
      {children}
    </Link>
  );
}

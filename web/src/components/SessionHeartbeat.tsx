"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

let lastCheckedAt = 0;
const INTERVAL_MS = 60_000;
const INITIAL_DELAY_MS = 15_000;

export default function SessionHeartbeat() {
  const router = useRouter();

  useEffect(() => {
    async function checkSession() {
      const now = Date.now();
      if (now - lastCheckedAt < INTERVAL_MS / 2) return;
      lastCheckedAt = now;
      try {
        const res = await fetch("/api/session/check");
        if (!res.ok) {
          router.replace("/login");
          return;
        }
        const data = await res.json();
        if (!data.active) router.replace("/login");
      } catch {
        // network error — do not redirect (user may be offline)
      }
    }

    const initial = setTimeout(checkSession, INITIAL_DELAY_MS);
    const id = setInterval(checkSession, INTERVAL_MS);
    return () => {
      clearTimeout(initial);
      clearInterval(id);
    };
  }, []);

  return null;
}

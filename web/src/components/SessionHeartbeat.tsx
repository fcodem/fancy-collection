"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SessionHeartbeat() {
  const router = useRouter();
  useEffect(() => {
    async function checkSession() {
      try {
        const res = await fetch("/api/session/check");
        if (!res.ok) { router.replace("/login"); return; }
        const data = await res.json();
        if (!data.active) router.replace("/login");
      } catch {
        // network error — do not redirect (user may be offline)
      }
    }
    checkSession();
    const id = setInterval(checkSession, 60_000);
    return () => clearInterval(id);
  }, [router]);
  return null;
}

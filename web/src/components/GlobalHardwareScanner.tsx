"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isAbortError, parseQrScanPayload } from "@/lib/bookingQrClient";
import {
  attachHardwareScanListener,
  isBookingQrScanPayload,
} from "@/lib/hardwareScanner";

const RESOLVE_TIMEOUT_MS = 6000;

/** Global USB scanner — opens booking records from bill / slip QRs on any page. */
export default function GlobalHardwareScanner() {
  const router = useRouter();
  const pathname = usePathname();
  const busyRef = useRef(false);

  useEffect(() => {
    if (pathname.startsWith("/login") || pathname.startsWith("/public/")) return;

    return attachHardwareScanListener({
      enabled: () => !busyRef.current,
      onScan(code) {
        if (!isBookingQrScanPayload(code)) return false;

        const parsed = parseQrScanPayload(code);
        if (!parsed?.sig) return false;

        busyRef.current = true;
        void (async () => {
          const controller = new AbortController();
          const timer = window.setTimeout(() => controller.abort(), RESOLVE_TIMEOUT_MS);
          try {
            const res = await fetch("/api/booking/qr/resolve", {
              method: "POST",
              headers: { "content-type": "application/json" },
              credentials: "same-origin",
              signal: controller.signal,
              body: JSON.stringify({
                token: parsed.token,
                signature: parsed.sig,
              }),
            });
            const data = (await res.json().catch(() => ({}))) as {
              target?: string;
              bookingId?: number;
            };
            if (res.status === 401) {
              router.replace("/login");
              return;
            }
            if (res.ok && data.target) {
              // Prefer replace + prefetch so record opens faster than a full history push.
              router.prefetch(data.target);
              router.replace(data.target);
            }
          } catch (e) {
            if (!isAbortError(e)) {
              console.warn("[GlobalHardwareScanner]", e);
            }
          } finally {
            window.clearTimeout(timer);
            busyRef.current = false;
          }
        })();

        return true;
      },
    });
  }, [pathname, router]);

  return null;
}

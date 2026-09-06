"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isAbortError, parseQrScanPayload } from "@/lib/bookingQrClient";
import {
  attachHardwareScanListener,
  isBookingQrScanPayload,
} from "@/lib/hardwareScanner";

const RESOLVE_TIMEOUT_MS = 6000;

function isDressScanFocusActive(): boolean {
  if (typeof document === "undefined") return false;
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  if (el.closest("[data-dress-scan], [data-suppress-hardware-scan]")) return true;
  // Camera dress-scan modal open
  if (document.querySelector("[data-suppress-hardware-scan='1']")) return true;
  return false;
}

/** Global USB scanner — opens booking records from bill / slip QRs on any page. */
export default function GlobalHardwareScanner() {
  const router = useRouter();
  const pathname = usePathname();
  const busyRef = useRef(false);

  useEffect(() => {
    if (pathname.startsWith("/login") || pathname.startsWith("/public/")) return;

    return attachHardwareScanListener({
      enabled: () => !busyRef.current && !isDressScanFocusActive(),
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
              code?: string;
            };
            // Invalid QR signature is 401 + QR_INVALID — do NOT treat as logout.
            if (res.status === 401 && data.code !== "QR_INVALID") {
              router.replace("/login");
              return;
            }
            if (res.ok && data.target) {
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

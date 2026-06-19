/** Client-safe QR payload parsing (no server/crypto imports). */

export type ParsedQrScan = {
  token: string;
  sig: string | null;
};

export function parseQrScanPayload(raw: string): ParsedQrScan | null {
  const text = raw.trim();
  if (!text) return null;

  let token: string | null = null;
  let sig: string | null = null;

  try {
    const url = new URL(text);
    const match = url.pathname.match(/\/booking\/qr\/([^/]+)/);
    if (match?.[1]) token = decodeURIComponent(match[1]);
    sig = url.searchParams.get("s");
  } catch {
    const pathMatch = text.match(/\/booking\/qr\/([^/\s?#]+)(?:\?s=([^&\s#]+))?/);
    if (pathMatch?.[1]) {
      token = decodeURIComponent(pathMatch[1]);
      sig = pathMatch[2] ? decodeURIComponent(pathMatch[2]) : null;
    }
  }

  if (!token && /^[0-9a-f-]{36}$/i.test(text)) {
    token = text;
    sig = null;
  }

  if (!token) return null;
  return { token, sig };
}

export function bookingQrNavigatePath(parsed: ParsedQrScan): string {
  const base = `/booking/qr/${encodeURIComponent(parsed.token)}`;
  if (parsed.sig) return `${base}?s=${encodeURIComponent(parsed.sig)}`;
  return base;
}

/** Mobile / tablet → back camera; PC / laptop → front camera. */
export function preferBackCamera(): boolean {
  if (typeof window === "undefined") return true;
  const ua = navigator.userAgent || "";
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return true;
  if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return true;
  return false;
}

export function isAbortError(e: unknown): boolean {
  if (e instanceof DOMException && e.name === "AbortError") return true;
  if (e instanceof Error && e.name === "AbortError") return true;
  return false;
}

export type CameraDevice = { id: string; label: string };

export function sortCamerasForDefault(cameras: CameraDevice[], backFirst: boolean): CameraDevice[] {
  if (cameras.length <= 1) return cameras;

  const scored = cameras.map((cam, index) => {
    const label = cam.label.toLowerCase();
    let score = index;

    if (/obs|virtual|manycam|snap camera|xsplit|nvidia broadcast|mmhmm|droidcam/i.test(label)) {
      score += 200;
    }

    if (backFirst) {
      if (/back|rear|environment|wide|telephoto|main/i.test(label)) score -= 100;
      if (/front|user|selfie|face/i.test(label)) score += 50;
    } else {
      if (/front|user|selfie|face|facetime|integrated|webcam|hd webcam|usb video/i.test(label)) score -= 100;
      if (/back|rear|environment|wide|telephoto/i.test(label)) score += 50;
    }
    return { cam, score };
  });

  scored.sort((a, b) => a.score - b.score);
  return scored.map((s) => s.cam);
}

export function nextCameraIndex(current: number, total: number): number {
  if (total <= 1) return 0;
  return (current + 1) % total;
}

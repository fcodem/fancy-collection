/** Realtime transport for multi-staff sync on Vercel serverless. */
export type RealtimeMode = "polling" | "ably" | "sse";

const VALID: RealtimeMode[] = ["polling", "ably", "sse"];

function parseMode(raw: string | undefined, fallback: RealtimeMode): RealtimeMode {
  if (raw && VALID.includes(raw as RealtimeMode)) return raw as RealtimeMode;
  return fallback;
}

/** Client-side mode (set NEXT_PUBLIC_REALTIME_MODE on Vercel). Default: polling. */
export function getClientRealtimeMode(): RealtimeMode {
  return parseMode(process.env.NEXT_PUBLIC_REALTIME_MODE, "polling");
}

/** Server-side publish mode. Default: polling (no in-process bus). */
export function getServerRealtimeMode(): RealtimeMode {
  return parseMode(
    process.env.REALTIME_MODE ?? process.env.NEXT_PUBLIC_REALTIME_MODE,
    "polling",
  );
}

const pollMs = Number(process.env.NEXT_PUBLIC_REALTIME_POLL_MS);
/** Default slower poll — badge freshness can lag a minute without hurting UX. */
export const POLL_INTERVAL_MS = pollMs > 0 ? pollMs : 60_000;

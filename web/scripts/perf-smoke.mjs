/**
 * Release performance smoke test (Prompt 13, Part B).
 *
 * Measures warm/cold p50/p95 and payload/db/auth timings for the key staff
 * scenarios against a running staging/preview deployment, and enforces the
 * release acceptance targets.
 *
 * Usage:
 *   BASE_URL="https://<preview>.vercel.app" COOKIE="fc_session=..." \
 *   node scripts/perf-smoke.mjs
 *
 * If BASE_URL is not set the smoke test is skipped (exit 0) with a clear notice,
 * so `verify:release` can run in environments without a deployment. A real
 * release gate MUST set BASE_URL (and COOKIE) so the targets are enforced.
 */

const BASE_URL = (process.env.BASE_URL || "").replace(/\/$/, "");
const COOKIE = process.env.COOKIE || "";
const WARM_SAMPLES = Number(process.env.PERF_WARM_SAMPLES || 12);

if (!BASE_URL) {
  console.warn(
    "[perf-smoke] SKIPPED — set BASE_URL (and COOKIE) to enforce performance targets.\n" +
      '           Example: BASE_URL="https://<preview>.vercel.app" COOKIE="fc_session=..." npm run perf:smoke',
  );
  process.exit(0);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** [label, path, warmTargetMs, coldTargetMs] */
const SCENARIOS = [
  ["qr-resolve", "/api/booking/qr/resolve?token=__smoke__", 50, 300, { expectAuthFast: true }],
  ["dashboard-data", "/api/dashboard/data", 700, 1500],
  ["nav-counts", "/api/dashboard/nav-counts", 400, 1000],
  ["delivery-search", `/api/delivery/search?date=${today()}`, 700, 1500],
  ["return-search", `/api/return/search?date=${today()}`, 700, 1500],
  ["availability", "/api/booking/available-items?limit=20", 800, 1500],
  ["packing-list", "/api/packing-list?limit=20", 700, 1500],
  ["inventory-list", "/api/inventory/list?limit=20", 800, 1500],
];

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function parseServerTiming(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(",")) {
    const m = /([a-zA-Z]+);dur=([0-9.]+)/.exec(part.trim());
    if (m) out[m[1]] = Number(m[2]);
  }
  return out;
}

async function timedFetch(path) {
  const start = Date.now();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: COOKIE ? { cookie: COOKIE } : {},
  });
  const buf = await res.arrayBuffer();
  const ms = Date.now() - start;
  const st = parseServerTiming(res.headers.get("server-timing"));
  return {
    ms,
    status: res.status,
    bytes: buf.byteLength,
    dbWait: st.dbWait ?? st.resolverDb ?? st.query ?? 0,
    auth: st.authTotal ?? st.auth ?? 0,
    query: st.query ?? st.initialRead ?? 0,
    poolTimeout: false,
  };
}

async function runScenario([label, path, warmTarget, coldTarget]) {
  // Cold: assume the caller warmed nothing for THIS path; first hit is cold.
  const cold = await timedFetch(path);
  const warm = [];
  for (let i = 0; i < WARM_SAMPLES; i += 1) warm.push(await timedFetch(path));
  const warmTimes = warm.map((r) => r.ms).sort((a, b) => a - b);
  const authOk = cold.status < 500;
  return {
    label,
    warmP50: percentile(warmTimes, 50),
    warmP95: percentile(warmTimes, 95),
    coldP50: cold.ms,
    coldP95: cold.ms,
    dbWait: warm.length ? Math.round(warm.reduce((s, r) => s + r.dbWait, 0) / warm.length) : 0,
    auth: warm.length ? Math.round(warm.reduce((s, r) => s + r.auth, 0) / warm.length) : 0,
    query: warm.length ? Math.round(warm.reduce((s, r) => s + r.query, 0) / warm.length) : 0,
    bytes: cold.bytes,
    requestCount: 1 + WARM_SAMPLES,
    status: cold.status,
    warmTarget,
    coldTarget,
    warmPass: percentile(warmTimes, 95) <= warmTarget,
    coldPass: cold.ms <= coldTarget,
    authOk,
  };
}

async function main() {
  console.log(`[perf-smoke] BASE_URL=${BASE_URL} warmSamples=${WARM_SAMPLES}`);
  const rows = [];
  for (const scenario of SCENARIOS) rows.push(await runScenario(scenario));

  console.log(
    "\nscenario         | warmP50 | warmP95 | cold  | dbWait | auth | query | bytes | status | warm<=t | cold<=t",
  );
  console.log(
    "-----------------|---------|---------|-------|--------|------|-------|-------|--------|---------|--------",
  );
  let failed = false;
  for (const r of rows) {
    if (!r.warmPass || !r.coldPass || r.status >= 500) failed = true;
    console.log(
      `${r.label.padEnd(17)}| ${String(r.warmP50).padStart(7)} | ${String(r.warmP95).padStart(7)} | ${String(r.coldP50).padStart(5)} | ${String(r.dbWait).padStart(6)} | ${String(r.auth).padStart(4)} | ${String(r.query).padStart(5)} | ${String(r.bytes).padStart(5)} | ${String(r.status).padStart(6)} | ${(r.warmPass ? "yes" : "NO").padStart(7)} | ${(r.coldPass ? "yes" : "NO").padStart(6)}`,
    );
  }

  console.log(
    failed
      ? "\n[perf-smoke] FAIL — one or more scenarios exceeded targets or returned 5xx."
      : "\n[perf-smoke] PASS — all scenarios within targets.",
  );
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error("[perf-smoke] fatal", error);
  process.exit(1);
});

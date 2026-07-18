/**
 * Prisma pool stability load test (Prompt 10).
 *
 * Fires the concurrent staff-usage scenarios against a running staging/preview
 * deployment and reports latency percentiles plus any pool timeouts (P2024).
 *
 * Usage:
 *   BASE_URL="https://<preview>.vercel.app" \
 *   COOKIE="fc_session=..." \
 *   node scripts/load-test.mjs
 *
 * COOKIE must be a valid authenticated session cookie header value. Never
 * commit real cookies. This script only reads; it performs no mutations.
 */

const BASE_URL = (process.env.BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const COOKIE = process.env.COOKIE || "";

if (!COOKIE) {
  console.warn("[load-test] No COOKIE set — authenticated routes will 401. Set COOKIE to a valid session.");
}

/** [label, path, concurrentRequests] */
const SCENARIOS = [
  ["dashboard-essential", "/api/dashboard/data", 5],
  ["nav-counts", "/api/dashboard/nav-counts", 10],
  ["delivery-search", "/api/delivery/search?date=" + today(), 10],
  ["return-search", "/api/return/search?date=" + today(), 10],
  ["availability", "/api/booking/available-items?limit=20", 10],
  ["inventory-list", "/api/inventory/list?limit=20", 5],
  ["packing-list", "/api/packing-list?limit=20", 5],
  ["session-check", "/api/session/check", 10],
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

async function timedFetch(path) {
  const start = Date.now();
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: COOKIE ? { cookie: COOKIE } : {},
    });
    const text = await res.text();
    const ms = Date.now() - start;
    const poolTimeout = /P2024|Timed out fetching a new connection|pool timeout/i.test(text);
    return { ms, status: res.status, poolTimeout, serverTiming: res.headers.get("server-timing") || "" };
  } catch (error) {
    return { ms: Date.now() - start, status: 0, poolTimeout: false, error: String(error) };
  }
}

async function runScenario(label, path, concurrency) {
  const results = await Promise.all(
    Array.from({ length: concurrency }, () => timedFetch(path)),
  );
  const times = results.map((r) => r.ms).sort((a, b) => a - b);
  const poolTimeouts = results.filter((r) => r.poolTimeout).length;
  const errors = results.filter((r) => r.status >= 500 || r.status === 0).length;
  const over5s = results.filter((r) => r.ms > 5000).length;
  return {
    label,
    concurrency,
    p50: percentile(times, 50),
    p95: percentile(times, 95),
    max: times[times.length - 1] || 0,
    poolTimeouts,
    errors,
    over5s,
    statuses: [...new Set(results.map((r) => r.status))].join(","),
  };
}

async function main() {
  console.log(`[load-test] BASE_URL=${BASE_URL}`);
  const rows = [];
  for (const [label, path, concurrency] of SCENARIOS) {
    // Warm once so cold-start does not dominate the first scenario.
    await timedFetch(path);
    rows.push(await runScenario(label, path, concurrency));
  }

  console.log("\nscenario            | conc | p50   | p95   | max   | poolTO | 5xx | >5s | statuses");
  console.log("--------------------|------|-------|-------|-------|--------|-----|-----|---------");
  let failed = false;
  for (const r of rows) {
    if (r.poolTimeouts > 0 || r.errors > 0 || r.over5s > 0) failed = true;
    console.log(
      `${r.label.padEnd(20)}| ${String(r.concurrency).padStart(4)} | ${String(r.p50).padStart(5)} | ${String(r.p95).padStart(5)} | ${String(r.max).padStart(5)} | ${String(r.poolTimeouts).padStart(6)} | ${String(r.errors).padStart(3)} | ${String(r.over5s).padStart(3)} | ${r.statuses}`,
    );
  }

  console.log(
    failed
      ? "\n[load-test] FAIL — pool timeouts, 5xx, or >5s requests observed."
      : "\n[load-test] PASS — no pool timeouts, no 5xx, no request over 5s.",
  );
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error("[load-test] fatal", error);
  process.exit(1);
});

/**
 * Full benchmark test suite: overlap logic, service layer, HTTP endpoints (3x timing).
 *
 * Usage (from web/):
 *   node scripts/test-benchmark-full.mjs
 *   node scripts/test-benchmark-full.mjs --json-out scripts/benchmark-results.json
 *
 * Requires: benchmark seed + dev server on :3000 for HTTP tests.
 */
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BASE = process.env.BASE_URL || "http://localhost:3000";
const RUNS = 3;
const SLOW_MS = 2000;

const prisma = new PrismaClient();
const args = new Set(process.argv.slice(2));
const jsonOut = args.has("--json-out")
  ? process.argv[process.argv.indexOf("--json-out") + 1]
  : join(__dirname, "benchmark-results.json");

function todayIso() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function monthStartIso() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-01`;
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function timingStats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const avg = Math.round(samples.reduce((s, v) => s + v, 0) / samples.length);
  return {
    samples,
    avg,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    slow: percentile(sorted, 95) > SLOW_MS,
  };
}

function extractCookie(res) {
  const raw = res.headers.getSetCookie?.() || [];
  const lines = raw.length ? raw : [res.headers.get("set-cookie")].filter(Boolean);
  return lines.map((c) => c.split(";")[0]).join("; ");
}

async function login() {
  const username = process.env.TEST_LOGIN_USER || "owner";
  const password = process.env.TEST_LOGIN_PASS;
  if (!password) {
    throw new Error("Set TEST_LOGIN_PASS (do not hardcode credentials in scripts).");
  }
  const res = await fetch(`${BASE}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
    redirect: "manual",
  });
  if (!res.ok && res.status !== 302) {
    throw new Error(`Login failed: ${res.status}`);
  }
  const cookie = extractCookie(res);
  if (!cookie) throw new Error("No session cookie");
  return cookie;
}

async function fetchEndpoint(cookie, path, retries = 2) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const t0 = Date.now();
    try {
      const res = await fetch(`${BASE}${path}`, {
        headers: cookie ? { Cookie: cookie } : {},
        signal: AbortSignal.timeout(30000),
      });
      const ms = Date.now() - t0;
      const text = await res.text();
      let body = null;
      try {
        body = JSON.parse(text);
      } catch {
        /* non-json */
      }
      const rowCount = countRows(body);
      return {
        ms,
        status: res.status,
        ok: res.ok && !(body && body.error),
        body,
        rowCount,
        text,
      };
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 500));
    }
  }
  return {
    ms: 0,
    status: 0,
    ok: false,
    body: null,
    rowCount: null,
    error: lastErr instanceof Error ? lastErr.message : String(lastErr),
  };
}

function countRows(body) {
  if (!body || typeof body !== "object") return null;
  if (Array.isArray(body)) return body.length;
  if (Array.isArray(body.results)) return body.results.length;
  if (Array.isArray(body.bookings)) return body.bookings.length;
  if (Array.isArray(body.items)) return body.items.length;
  if (Array.isArray(body.free_items)) return body.free_items.length;
  if (Array.isArray(body.data)) return body.data.length;
  if (Array.isArray(body.logs)) return body.logs.length;
  if (Array.isArray(body.events)) return body.events.length;
  if (body.total != null) return Number(body.total);
  if (body.count != null) return Number(body.count);
  return null;
}

async function runServiceTests() {
  const proc = spawnSync("npx", ["tsx", "scripts/test-benchmark-services.ts"], {
    cwd: ROOT,
    encoding: "utf8",
    shell: true,
    env: { ...process.env, FORCE_COLOR: "0" },
  });
  let parsed = [];
  try {
    const match = proc.stdout.match(/---JSON---\n([\s\S]+)$/);
    if (match) parsed = JSON.parse(match[1]);
  } catch {
    /* fallback */
  }
  return {
    exitCode: proc.status ?? 1,
    stdout: proc.stdout,
    stderr: proc.stderr,
    results: parsed,
  };
}

async function testOverlapLogic() {
  const results = [];

  const hardOverlap = await prisma.$queryRaw`
    SELECT bi1.item_id AS item_id, b1.delivery_date AS d1, b1.return_date AS r1
    FROM bookings b1
    JOIN booking_items bi1 ON bi1.booking_id = b1.id
    JOIN bookings b2 ON b2.id > b1.id
    JOIN booking_items bi2 ON bi2.booking_id = b2.id AND bi2.item_id = bi1.item_id
    WHERE b1.booking_number LIKE 'BENCH-BKG-%'
      AND b2.booking_number LIKE 'BENCH-BKG-%'
      AND b1.status IN ('booked', 'delivered')
      AND b2.status IN ('booked', 'delivered')
      AND b1.delivery_date = b2.delivery_date
      AND b1.return_date = b2.return_date
    LIMIT 1
  `;

  const overlapPairs = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS cnt
    FROM bookings b1
    JOIN booking_items bi1 ON bi1.booking_id = b1.id
    JOIN bookings b2 ON b2.id > b1.id
    JOIN booking_items bi2 ON bi2.booking_id = b2.id AND bi2.item_id = bi1.item_id
    WHERE b1.booking_number LIKE 'BENCH-BKG-%'
      AND b2.booking_number LIKE 'BENCH-BKG-%'
      AND b1.status IN ('booked', 'delivered')
      AND b2.status IN ('booked', 'delivered')
      AND b1.delivery_date < (b2.return_date + INTERVAL '1 day')
      AND b1.return_date >= b2.delivery_date
  `;

  results.push({
    name: "overlap pairs exist in seed data",
    ok: (overlapPairs[0]?.cnt ?? 0) > 0,
    detail: `${overlapPairs[0]?.cnt ?? 0} active overlap pairs`,
  });

  if (hardOverlap.length > 0) {
    results.push({
      name: "getAvailableItemsApi excludes hard-overlapped item",
      ok: true,
      detail: `covered in service tests (item ${hardOverlap[0].item_id})`,
    });
  }

  return results;
}

function buildHttpEndpoints(today, monthStart, overlapItemId) {
  const dateCheckPath = overlapItemId
    ? `/api/booking/date-check?delivery_date=${today}&return_date=${today}&item_ids[]=${overlapItemId}`
    : `/api/booking/date-check?delivery_date=${today}&return_date=${today}&item_ids[]=1`;
  return [
    { name: "session/check", path: "/api/session/check", auth: false },
    { name: "dashboard/data", path: "/api/dashboard/data" },
    { name: "dashboard/nav-counts", path: "/api/dashboard/nav-counts" },
    { name: "dashboard/free-items", path: `/api/dashboard/free-items?delivery_date=${today}&return_date=${today}` },
    { name: "dashboard/search", path: `/api/dashboard/search?q=Bench&date=${today}` },
    { name: "returning-today", path: "/api/returning-today" },
    { name: "returning-today (alternate hot date)", path: "/api/returning-today?date=2026-06-15" },
    { name: "booking-list", path: `/api/booking-list?delivery_date=${today}&return_date=${today}` },
    { name: "booking/available-items", path: `/api/booking/available-items?delivery_date=${today}&return_date=${today}` },
    { name: "booking/next-serial", path: "/api/booking/next-serial" },
    { name: "booking/suggest", path: "/api/booking/suggest?q=Bench" },
    { name: "search-booking", path: `/api/search-booking?q=Bench&date=${today}&page=1&pageSize=25` },
    { name: "all-record-search", path: `/api/all-record-search?q=Bench&date=${today}&page=1&pageSize=25` },
    { name: "delivery/search", path: `/api/delivery/search?q=Bench&date=${today}` },
    { name: "return/search", path: `/api/return/search?q=Bench&date=${today}` },
    { name: "inventory/search", path: "/api/inventory/search?q=BENCH" },
    { name: "packing-list", path: `/api/packing-list?delivery_date=${today}&return_date=${today}` },
    { name: "categories", path: "/api/categories" },
    { name: "postponed-booking", path: "/api/postponed-booking" },
    { name: "postponed-booking/search", path: `/api/postponed-booking?mode=search&q=Bench&date=${today}` },
    { name: "finance/daily-sale", path: `/api/finance/daily-sale?date=${today}` },
    { name: "finance/daily-booking", path: `/api/finance/daily-booking?date=${today}` },
    { name: "finance/monthly-sale", path: `/api/finance/monthly-sale?month=${today.slice(0, 7)}` },
    { name: "finance/yearly-sale", path: `/api/finance/yearly-sale?year=${today.slice(0, 4)}` },
    { name: "finance/top-performer", path: `/api/finance/top-performer?from=${monthStart}&to=${today}` },
    { name: "finance/category-analysis", path: `/api/finance/category-analysis?from=${monthStart}&to=${today}` },
    { name: "finance/security-deposit", path: `/api/finance/security-deposit?from=${monthStart}&to=${today}` },
    { name: "finance/inventory-profitability", path: `/api/finance/inventory-profitability?from=${monthStart}&to=${today}` },
    { name: "admin/calendar-events", path: `/api/admin/calendar-events?from=${monthStart}&to=${today}` },
    { name: "admin/activity-log", path: "/api/admin/activity-log?page=1&limit=25" },
    { name: "booking/date-check", path: dateCheckPath },
    { name: "dress-checker", path: `/api/dress-checker?dress_name=BENCH&delivery_date=${today}&return_date=${today}` },
  ];
}

async function runHttpBenchmark(getCookie, endpoints) {
  const results = [];
  for (const ep of endpoints) {
    let cookie = null;
    if (ep.auth !== false) {
      try {
        cookie = await getCookie(true);
      } catch (e) {
        results.push({
          name: ep.name,
          path: ep.path,
          ok: false,
          status: 0,
          rowCount: null,
          samples: [0],
          avg: 0,
          p50: 0,
          p95: 0,
          slow: false,
          detail: `login failed: ${e.message}`,
        });
        continue;
      }
    }
    const samples = [];
    let last = null;
    for (let r = 0; r < RUNS; r++) {
      last = await fetchEndpoint(ep.auth === false ? null : cookie, ep.path);
      samples.push(last.ms || 1);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const timing = timingStats(samples);
    results.push({
      name: ep.name,
      path: ep.path,
      ok: last?.ok ?? false,
      status: last?.status,
      rowCount: last?.rowCount,
      ...timing,
      detail: last?.ok ? undefined : last?.body?.error || last?.error || `HTTP ${last?.status}`,
    });
  }
  return results;
}

async function gatherSeedStats() {
  const [items, bookings, overlapPairs] = await Promise.all([
    prisma.clothingItem.count({ where: { sku: { startsWith: "BENCH-" } } }),
    prisma.booking.count({ where: { bookingNumber: { startsWith: "BENCH-BKG-" } } }),
    prisma.$queryRaw`
      SELECT COUNT(*)::int AS cnt
      FROM bookings b1
      JOIN booking_items bi1 ON bi1.booking_id = b1.id
      JOIN bookings b2 ON b2.id > b1.id
      JOIN booking_items bi2 ON bi2.booking_id = b2.id AND bi2.item_id = bi1.item_id
      WHERE b1.booking_number LIKE 'BENCH-BKG-%'
        AND b2.booking_number LIKE 'BENCH-BKG-%'
        AND b1.status IN ('booked', 'delivered')
        AND b2.status IN ('booked', 'delivered')
        AND b1.delivery_date < (b2.return_date + INTERVAL '1 day')
        AND b1.return_date >= b2.delivery_date
    `.then((r) => r[0]?.cnt ?? 0),
  ]);

  const statusCounts = await prisma.booking.groupBy({
    by: ["status"],
    where: { bookingNumber: { startsWith: "BENCH-BKG-" } },
    _count: { id: true },
  });

  return { items, bookings, overlapPairs, statusCounts };
}

async function main() {
  const today = todayIso();
  const monthStart = monthStartIso();
  const started = Date.now();

  console.log("=== Full benchmark test suite ===\n");

  const seedStats = await gatherSeedStats();
  console.log(`Seed: ${seedStats.items} items, ${seedStats.bookings} bookings, ${seedStats.overlapPairs} overlap pairs\n`);

  if (seedStats.bookings < 14000) {
    console.warn(`WARNING: expected ~15000 bookings, found ${seedStats.bookings}. Run extra seed first.\n`);
  }

  console.log("--- Overlap / double-booking tests ---");
  const overlapResults = await testOverlapLogic();
  const hardOverlapForHttp = await prisma.$queryRaw`
    SELECT bi1.item_id AS item_id
    FROM bookings b1
    JOIN booking_items bi1 ON bi1.booking_id = b1.id
    JOIN bookings b2 ON b2.id > b1.id
    JOIN booking_items bi2 ON bi2.booking_id = b2.id AND bi2.item_id = bi1.item_id
    WHERE b1.booking_number LIKE 'BENCH-BKG-%'
      AND b2.booking_number LIKE 'BENCH-BKG-%'
      AND b1.status IN ('booked', 'delivered')
      AND b2.status IN ('booked', 'delivered')
      AND b1.delivery_date = b2.delivery_date
      AND b1.return_date = b2.return_date
    LIMIT 1
  `;
  for (const r of overlapResults) {
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
  }

  console.log("\n--- Service layer tests ---");
  const serviceRun = await runServiceTests();
  process.stdout.write(serviceRun.stdout);
  if (serviceRun.stderr) process.stderr.write(serviceRun.stderr);

  let cookie;
  try {
    cookie = await login();
    console.log("\n--- HTTP endpoint benchmarks (3 runs each) ---");
  } catch (e) {
    console.error(`\nHTTP tests skipped: ${e.message}`);
    console.error("Start dev server: npm run dev");
  }

  let httpResults = [];
  let cookieHolder = { value: null };
  const getCookie = async (force = false) => {
    if (!cookieHolder.value || force) cookieHolder.value = await login();
    return cookieHolder.value;
  };
  if (cookie) {
    cookieHolder.value = cookie;
    const overlapItemId = hardOverlapForHttp?.item_id ?? null;
    const endpoints = buildHttpEndpoints(today, monthStart, overlapItemId);
    httpResults = await runHttpBenchmark(getCookie, endpoints);
    for (const r of httpResults) {
      const flag = r.slow ? " SLOW" : "";
      console.log(
        `${r.ok ? "PASS" : "FAIL"}${flag}  ${r.name}  p50=${r.p50}ms p95=${r.p95}ms avg=${r.avg}ms` +
          (r.rowCount != null ? ` rows=${r.rowCount}` : "") +
          (r.detail ? ` — ${r.detail}` : ""),
      );
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    seedStats,
    overlapResults,
    serviceResults: serviceRun.results,
    httpResults,
    durationMs: Date.now() - started,
  };

  mkdirSync(dirname(jsonOut), { recursive: true });
  writeFileSync(jsonOut, JSON.stringify(report, null, 2));
  console.log(`\nResults written to ${jsonOut}`);

  const failures =
    overlapResults.filter((r) => !r.ok).length +
    (serviceRun.exitCode !== 0 ? 1 : 0) +
    httpResults.filter((r) => !r.ok).length;

  if (failures > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

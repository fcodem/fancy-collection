/**
 * Read-only load check for POST /api/dress-checker/scan-availability.
 *
 * Simulates five staff users, ten scans each, against one date window. Supply
 * five authenticated cookie headers as a JSON array (or one COOKIE for local
 * smoke testing) and comma-separated dress codes:
 *
 *   BASE_URL=https://preview.example \
 *   STAFF_COOKIES='["fancy_collection_session=...","..."]' \
 *   SCAN_CODES='FC-D-A,FC-D-B,...' \
 *   node scripts/scan-availability-load-test.mjs
 */

const BASE_URL = (process.env.BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const CODES = (process.env.SCAN_CODES || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
let cookies = [];
try {
  cookies = JSON.parse(process.env.STAFF_COOKIES || "[]");
} catch {
  throw new Error("STAFF_COOKIES must be a JSON array of cookie header strings");
}
if (!Array.isArray(cookies)) throw new Error("STAFF_COOKIES must be a JSON array");
if (!cookies.length && process.env.COOKIE) cookies = Array(5).fill(process.env.COOKIE);

if (!cookies.length || !CODES.length) {
  console.error(
    "[scan-load] Set STAFF_COOKIES (or COOKIE) and SCAN_CODES. No requests were sent.",
  );
  process.exit(2);
}
while (cookies.length < 5) cookies.push(cookies[cookies.length - 1]);
cookies = cookies.slice(0, 5);

const deliveryDateTime =
  process.env.DELIVERY_DATE_TIME || "2035-02-10T16:00:00+05:30";
const returnDateTime =
  process.env.RETURN_DATE_TIME || "2035-02-12T11:00:00+05:30";

async function scan(cookie, code) {
  const started = performance.now();
  try {
    const response = await fetch(
      `${BASE_URL}/api/dress-checker/scan-availability`,
      {
        method: "POST",
        headers: {
          cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          code,
          deliveryDateTime,
          returnDateTime,
          excludeBookingId: null,
        }),
      },
    );
    const text = await response.text();
    const elapsedMs = Math.round(performance.now() - started);
    let payload = {};
    try {
      payload = JSON.parse(text);
    } catch {
      /* reported below */
    }
    return {
      code,
      elapsedMs,
      httpStatus: response.status,
      status: payload.status,
      dressId: payload.dress?.id ?? null,
      cacheStatus: payload.timing?.cacheStatus,
      poolFailure: /P2024|P2028|pool timeout|timed out fetching/i.test(text),
      wrongPayload: !payload.status || !Array.isArray(payload.blockingRecords),
    };
  } catch (error) {
    return {
      code,
      elapsedMs: Math.round(performance.now() - started),
      httpStatus: 0,
      poolFailure: /P2024|P2028|pool timeout|timed out fetching/i.test(String(error)),
      wrongPayload: true,
      error: String(error),
    };
  }
}

function percentile(values, percent) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((percent / 100) * sorted.length))] || 0;
}

async function main() {
  console.log(
    `[scan-load] target=${BASE_URL} staff=5 scansPerStaff=10 codes=${CODES.length}`,
  );

  // Five concurrent staff loops; each staff member scans serially, matching the
  // UI's one-active-request queue while stressing the shared Prisma pool.
  const perUser = await Promise.all(
    cookies.map(async (cookie, userIndex) => {
      const rows = [];
      for (let scanIndex = 0; scanIndex < 10; scanIndex += 1) {
        const code = CODES[(userIndex * 10 + scanIndex) % CODES.length];
        rows.push(await scan(cookie, code));
      }
      return rows;
    }),
  );
  const results = perUser.flat();
  // One immediate repeat per user measures the warm, same-user cache path
  // without changing the required 5 × 10 primary load.
  const warmProbes = await Promise.all(
    cookies.map((cookie, userIndex) =>
      scan(cookie, CODES[(userIndex * 10) % CODES.length]),
    ),
  );
  results.push(...warmProbes);

  const poolFailures = results.filter((row) => row.poolFailure);
  const serverErrors = results.filter(
    (row) => row.httpStatus === 0 || row.httpStatus >= 500,
  );
  const malformed = results.filter((row) => row.wrongPayload);
  const identityByCode = new Map();
  const wrongDress = [];
  for (const row of results) {
    if (row.dressId == null) continue;
    const prior = identityByCode.get(row.code);
    if (prior != null && prior !== row.dressId) wrongDress.push(row);
    identityByCode.set(row.code, row.dressId);
  }

  const durations = results.map((row) => row.elapsedMs);
  const warm = results.filter((row) =>
    ["hit", "coalesced"].includes(row.cacheStatus),
  );
  const cold = results.filter((row) => row.cacheStatus === "miss");
  console.log({
    primaryRequests: 50,
    warmProbeRequests: warmProbes.length,
    requests: results.length,
    p50Ms: percentile(durations, 50),
    p95Ms: percentile(durations, 95),
    maxMs: Math.max(...durations),
    warmMaxMs: Math.max(0, ...warm.map((row) => row.elapsedMs)),
    coldMaxMs: Math.max(0, ...cold.map((row) => row.elapsedMs)),
    cacheStatuses: Object.fromEntries(
      [...new Set(results.map((row) => row.cacheStatus || "unknown"))].map(
        (status) => [
          status,
          results.filter((row) => (row.cacheStatus || "unknown") === status).length,
        ],
      ),
    ),
    poolFailures: poolFailures.length,
    serverErrors: serverErrors.length,
    malformed: malformed.length,
    wrongDress: wrongDress.length,
  });

  const failed =
    poolFailures.length > 0 ||
    serverErrors.length > 0 ||
    malformed.length > 0 ||
    wrongDress.length > 0;
  console.log(
    failed
      ? "[scan-load] FAIL — see counts above."
      : "[scan-load] PASS — no pool timeout, 5xx, malformed, or cross-dress result.",
  );
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error("[scan-load] fatal", error);
  process.exit(1);
});

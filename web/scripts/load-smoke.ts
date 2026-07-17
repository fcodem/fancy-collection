/**
 * Concurrent load smoke — hits production (or BASE_URL) with N parallel unauthenticated
 * + optional authenticated GETs. Does not create bookings.
 *
 *   LOAD_BASE_URL=https://fcmanage.vercel.app LOAD_CONCURRENCY=10 npx tsx scripts/load-smoke.ts
 */
const base = (process.env.LOAD_BASE_URL || "https://fcmanage.vercel.app").replace(/\/$/, "");
const n = Math.min(20, Math.max(1, Number(process.env.LOAD_CONCURRENCY || 10)));

async function timed(path: string) {
  const t0 = Date.now();
  const res = await fetch(`${base}${path}`, { redirect: "manual" });
  return { path, status: res.status, ms: Date.now() - t0 };
}

async function main() {
  console.log(`load-smoke base=${base} concurrency=${n}`);
  const paths = ["/login", "/", "/booking", "/api/health"];
  const jobs: Promise<{ path: string; status: number; ms: number }>[] = [];
  for (let i = 0; i < n; i++) {
    for (const p of paths) jobs.push(timed(p));
  }
  const results = await Promise.all(jobs);
  const byPath = new Map<string, number[]>();
  for (const r of results) {
    const arr = byPath.get(r.path) || [];
    arr.push(r.ms);
    byPath.set(r.path, arr);
  }
  for (const [path, times] of byPath) {
    const sorted = [...times].sort((a, b) => a - b);
    const avg = Math.round(times.reduce((s, x) => s + x, 0) / times.length);
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!;
    console.log(`${path} n=${times.length} avgMs=${avg} p95Ms=${p95} statuses=${[
      ...new Set(results.filter((r) => r.path === path).map((r) => r.status)),
    ].join(",")}`);
  }
  console.log("LOAD_SMOKE_DONE (no booking writes)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

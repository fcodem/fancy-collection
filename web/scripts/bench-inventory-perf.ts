/**
 * Local/staging inventory performance benchmark.
 *
 * Usage (never against production mutations):
 *   BENCH_BASE_URL=http://localhost:3000 BENCH_COOKIE='session=...' npx tsx scripts/bench-inventory-perf.ts
 *
 * Measures read-only list/search endpoints under concurrent load.
 * Does not write inventory, book, or mutate production data.
 */
const BASE = (process.env.BENCH_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const COOKIE = process.env.BENCH_COOKIE || "";

if (/fcmanage\.vercel\.app|fancycollection/i.test(BASE) && !process.env.ALLOW_PROD_BENCH) {
  console.error("Refusing production URL without ALLOW_PROD_BENCH=1");
  process.exit(1);
}

async function timed(label: string, fn: () => Promise<Response>) {
  const t0 = Date.now();
  const res = await fn();
  const ms = Date.now() - t0;
  const st = res.headers.get("server-timing") || "";
  const ok = res.ok;
  let rows = 0;
  try {
    const j = (await res.json()) as { groups?: unknown[]; rowCount?: number };
    rows = j.rowCount ?? j.groups?.length ?? 0;
  } catch {
    /* ignore */
  }
  return { label, ms, ok, status: res.status, serverTiming: st, rows };
}

async function main() {
  const headers: Record<string, string> = {};
  if (COOKIE) headers.cookie = COOKIE;

  console.log(`Benchmark base=${BASE}`);
  const single = await timed("list-first-page", () =>
    fetch(`${BASE}/api/inventory/list?limit=40&sort=name`, { headers }),
  );
  console.log(single);

  const search = await timed("search-q", () =>
    fetch(`${BASE}/api/inventory/search?q=le`, { headers }),
  );
  console.log(search);

  const suggest = await timed("dress-name-suggest", () =>
    fetch(`${BASE}/api/dress-name/suggest?q=le`, { headers }),
  );
  console.log(suggest);

  for (const n of [5, 10]) {
    const t0 = Date.now();
    const results = await Promise.all(
      Array.from({ length: n }, (_, i) =>
        timed(`concurrent-${n}-${i}`, () =>
          fetch(`${BASE}/api/inventory/list?limit=20`, { headers }),
        ),
      ),
    );
    const total = Date.now() - t0;
    const ok = results.every((r) => r.ok);
    const max = Math.max(...results.map((r) => r.ms));
    const avg = Math.round(results.reduce((s, r) => s + r.ms, 0) / results.length);
    console.log({ concurrent: n, ok, wallMs: total, avgMs: avg, maxMs: max });
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

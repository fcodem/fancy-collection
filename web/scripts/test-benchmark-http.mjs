/**
 * HTTP smoke test for benchmark data (requires dev server on :3000).
 * Usage: node scripts/test-benchmark-http.mjs
 */

const BASE = process.env.BASE_URL || "http://localhost:3000";

function todayIso() {
  const t = new Date();
  const m = String(t.getMonth() + 1).padStart(2, "0");
  const d = String(t.getDate()).padStart(2, "0");
  return `${t.getFullYear()}-${m}-${d}`;
}

const today = todayIso();

const endpoints = [
  { name: "session/check", path: "/api/session/check" },
  { name: "dashboard/data", path: "/api/dashboard/data" },
  { name: "dashboard/nav-counts", path: "/api/dashboard/nav-counts" },
  { name: "booking-list", path: `/api/booking-list?delivery_date=${today}&return_date=${today}` },
  { name: "booking/available-items", path: `/api/booking/available-items?delivery_date=${today}&return_date=${today}` },
  { name: "search-booking", path: `/api/search-booking?q=Bench&date=${today}&page=1&pageSize=25` },
  { name: "all-record-search", path: `/api/all-record-search?q=Bench&date=${today}&page=1&pageSize=25` },
  { name: "delivery/search", path: `/api/delivery/search?q=Bench&date=${today}` },
  { name: "return/search", path: `/api/return/search?q=Bench&date=${today}` },
  { name: "inventory/search", path: "/api/inventory/search?q=BENCH" },
  { name: "dashboard/free-items", path: `/api/dashboard/free-items?delivery_date=${today}&return_date=${today}` },
  { name: "packing-list", path: `/api/packing-list?delivery_date=${today}&return_date=${today}` },
  { name: "categories", path: "/api/categories" },
  { name: "returning-today (today)", path: `/api/returning-today?date=${today}` },
  { name: "returning-today (alternate hot date)", path: "/api/returning-today?date=2026-06-15" },
];

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
    throw new Error(`Login failed: ${res.status} ${await res.text()}`);
  }
  const cookie = extractCookie(res);
  if (!cookie) throw new Error("No session cookie from login");
  return cookie;
}

async function testEndpoint(cookie, { name, path }) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}${path}`, { headers: { Cookie: cookie } });
    const ms = Date.now() - t0;
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    if (!res.ok) {
      return { name, ok: false, ms, detail: `HTTP ${res.status}` };
    }
    if (body && body.error) {
      return { name, ok: false, ms, detail: body.error };
    }
    if (name.includes("alternate hot date")) {
      const rows = Array.isArray(body) ? body : body?.data;
      if (!Array.isArray(rows) || rows.length === 0) {
        return { name, ok: false, ms, detail: "no alternate rows — run seed-alternate-handover.mjs" };
      }
      if (!rows[0]?.next_booking) {
        return { name, ok: false, ms, detail: "row missing next_booking" };
      }
      return { name, ok: true, ms, detail: `${rows.length} alternates` };
    }
    return { name, ok: true, ms };
  } catch (e) {
    return { name, ok: false, ms: Date.now() - t0, detail: e instanceof Error ? e.message : String(e) };
  }
}

async function main() {
  console.log(`HTTP benchmark tests → ${BASE}\n`);
  let cookie;
  try {
    cookie = await login();
    console.log("Logged in as owner\n");
  } catch (e) {
    console.error(`Login/setup failed: ${e instanceof Error ? e.message : e}`);
    console.error("Start dev server: npm run dev");
    process.exit(1);
  }

  const results = [];
  for (const ep of endpoints) {
    const r = await testEndpoint(cookie, ep);
    results.push(r);
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name} (${r.ms}ms)${r.detail ? ` — ${r.detail}` : ""}`);
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} passed`);
  if (passed !== results.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

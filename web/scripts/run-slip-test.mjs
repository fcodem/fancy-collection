/**
 * Trigger full slip WhatsApp test via admin API (requires dev server running).
 *
 * Usage (from web/):
 *   node scripts/run-slip-test.mjs
 *   node scripts/run-slip-test.mjs 8077843874
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = (process.argv[2] || "8077843874").replace(/\D/g, "").slice(-10);
const base = process.env.APP_URL || "http://localhost:3000";

const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

const user = process.env.SLIP_TEST_USER || "owner";
const pass = process.env.SLIP_TEST_PASS;
if (!pass) {
  console.error("Set SLIP_TEST_PASS to a strong password (do not hardcode credentials).");
  process.exit(1);
}

const jar = new Map();

function parseSetCookie(res) {
  const raw = res.headers.getSetCookie?.() || [];
  for (const line of raw) {
    const [pair] = line.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
}

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function login() {
  const res = await fetch(`${base}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: user, password: pass }),
  });
  parseSetCookie(res);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Login failed HTTP ${res.status}`);
  console.log("Logged in as", user);
}

async function runTest() {
  const res = await fetch(`${base}/api/admin/test-all-slips`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieHeader(),
    },
    body: JSON.stringify({
      phone,
      delivery_date: "2026-07-10",
      return_date: "2026-08-06",
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("Test failed:", data);
    process.exit(1);
  }
  console.log(JSON.stringify(data, null, 2));
  console.log(`\nDone — check WhatsApp on +91${phone}`);
}

async function resendSlips(bookingId, kinds) {
  const res = await fetch(`${base}/api/admin/resend-booking-slips`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieHeader(),
    },
    body: JSON.stringify({ booking_id: bookingId, kinds }),
  });
  const data = await res.json();
  console.log(`Resend booking ${bookingId} [${kinds.join(", ")}]:`, JSON.stringify(data, null, 2));
  return data;
}

async function retryIncomplete(bookingId) {
  return resendSlips(bookingId, ["incomplete"]);
}

try {
  const retryId = process.argv[3] ? parseInt(process.argv[3], 10) : 0;
  const kindsArg = process.argv[4] || "incomplete,return";
  await login();
  if (retryId > 0) {
    const kinds = kindsArg.split(",").map((k) => k.trim()).filter(Boolean);
    await resendSlips(retryId, kinds);
  } else {
    await runTest();
  }
} catch (e) {
  console.error(e);
  process.exit(1);
}

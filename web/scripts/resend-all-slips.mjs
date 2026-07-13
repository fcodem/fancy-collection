/**
 * Resend all slip types for slip-test bookings to your WhatsApp.
 * Usage: node scripts/resend-all-slips.mjs [phone]
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
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
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
  for (const line of res.headers.getSetCookie?.() || []) {
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
  if (!res.ok) throw new Error(data.error || "Login failed");
}

async function resend(bookingId, kinds) {
  const res = await fetch(`${base}/api/admin/resend-booking-slips`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader() },
    body: JSON.stringify({ booking_id: bookingId, kinds }),
  });
  const data = await res.json();
  console.log(`\n#${bookingId}:`, JSON.stringify(data, null, 2));
  return data;
}

async function updatePhone(bookingId) {
  const { PrismaClient } = await import("@prisma/client");
  const p = new PrismaClient();
  await p.booking.update({
    where: { id: bookingId },
    data: { whatsappNo: phone, contact1: phone },
  });
  await p.$disconnect();
}

const BOOKINGS = [15344, 15345, 15346];
const ALL_KINDS = ["booking", "delivery", "return", "incomplete"];

await login();
console.log(`Resending all slips → +91${phone}`);

for (const id of BOOKINGS) {
  await updatePhone(id);
  await resend(id, ALL_KINDS);
}

console.log("\nDone. Check WhatsApp on +91" + phone);

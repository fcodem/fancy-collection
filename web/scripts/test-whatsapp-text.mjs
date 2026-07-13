import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const base = process.env.APP_URL || "http://localhost:3000";
const phone = (process.argv[2] || "8077843874").replace(/\D/g, "").slice(-10);

for (const line of fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const jar = new Map();
function parseSetCookie(res) {
  for (const line of res.headers.getSetCookie?.() || []) {
    const [pair] = line.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
}

const username = process.env.TEST_LOGIN_USER || "owner";
const password = process.env.TEST_LOGIN_PASS;
if (!password) {
  console.error("Set TEST_LOGIN_PASS (do not hardcode credentials in scripts).");
  process.exit(1);
}

const login = await fetch(`${base}/api/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username, password }),
});
parseSetCookie(login);

const res = await fetch(`${base}/api/admin/test-whatsapp-text`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Cookie: [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; "),
  },
  body: JSON.stringify({ phone }),
});
console.log(await res.json());

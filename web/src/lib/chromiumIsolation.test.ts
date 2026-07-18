import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

describe("Chromium isolation", () => {
  const srcFiles = walk(path.join(root, "src"));
  // Match real import/require/dynamic-import forms only, not comment mentions.
  const PKG = String.raw`(?:@sparticuz\/chromium|puppeteer-core|puppeteer)`;
  const CHROMIUM = new RegExp(
    String.raw`(?:from\s*["']${PKG}["'])|(?:import\(\s*["']${PKG}["']\s*\))|(?:require\(\s*["']${PKG}["']\s*\))`,
  );

  it("imports Chromium/Puppeteer in exactly one module", () => {
    const importers = srcFiles.filter((f) => {
      if (/\.test\.tsx?$/.test(f)) return false;
      return CHROMIUM.test(fs.readFileSync(f, "utf8"));
    });
    const rel = importers.map((f) => path.relative(root, f).replace(/\\/g, "/"));
    assert.deepEqual(
      rel,
      ["src/lib/services/whatsapp/pdfBrowserPool.ts"],
      `Unexpected Chromium importers: ${rel.join(", ")}`,
    );
  });

  it("traces Chromium into only the internal render function", () => {
    const config = read("next.config.ts");
    assert.match(config, /"\/api\/internal\/slip\/render":\s*\[CHROMIUM_TRACE\]/);
    // The wildcard bundles must not include the chromium trace.
    const apiWildcard = config.slice(config.indexOf('"/api/**/*"'), config.indexOf('"/api/internal/slip/render"'));
    assert.doesNotMatch(apiWildcard, /CHROMIUM_TRACE/);
  });

  it("only the internal route imports the direct renderer", () => {
    const importers = srcFiles.filter((f) =>
      /slipHtmlPdfDirect\.server/.test(fs.readFileSync(f, "utf8")) && !/slipHtmlPdfDirect\.server\.ts$/.test(f),
    );
    const rel = importers.map((f) => path.relative(root, f).replace(/\\/g, "/"));
    assert.deepEqual(rel, ["src/app/api/internal/slip/render/route.ts"]);
  });
});

describe("internal renderer authentication", () => {
  it("verifies an HMAC (timestamp + nonce + body hash), not a plain secret", () => {
    const route = read("src/app/api/internal/slip/render/route.ts");
    assert.match(route, /verifySlipRenderAuth/);
    assert.match(route, /await req\.text\(\)/);
    assert.doesNotMatch(route, /isValidPdfRenderSecret/);
  });

  it("signs outgoing render requests", () => {
    const caller = read("src/lib/services/whatsapp/slipHtmlPdf.server.ts");
    assert.match(caller, /buildSlipRenderAuthHeaders/);
    assert.doesNotMatch(caller, /"x-pdf-secret"/);
  });

  it("uses a timing-safe comparison and replay guard", () => {
    const auth = read("src/lib/slipRenderAuth.ts");
    assert.match(auth, /timingSafeEqual/);
    assert.match(auth, /seenNonces/);
    assert.match(auth, /reason: "replay"/);
    assert.match(auth, /reason: "expired"/);
  });
});

describe("branded jsPDF fallback", () => {
  it("embeds the logo in operation slip fallback", () => {
    const fallback = read("src/lib/services/whatsapp/operationSlipPdfFallback.ts");
    assert.match(fallback, /loadSlipLogoDataUrl/);
    assert.match(fallback, /addImage/);
  });
});

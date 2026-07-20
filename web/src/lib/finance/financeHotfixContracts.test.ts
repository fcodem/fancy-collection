import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(relative: string) {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

const FINANCE_ROUTES = [
  "/finance/ledger",
  "/finance/daily-sale",
  "/finance/daily-booking",
  "/finance/monthly-sale",
  "/finance/yearly-sale",
  "/finance/top-performer",
  "/finance/inventory-profitability",
  "/finance/category-analysis",
  "/finance/security-deposit",
  "/finance/suppliers",
];

describe("finance index redirect", () => {
  it("redirects /finance to ledger", () => {
    const page = source("src/app/finance/page.tsx");
    assert.match(page, /redirect\(\s*["']\/finance\/ledger["']\s*\)/);
  });
});

describe("finance nav prefetch isolation", () => {
  it("disables prefetch on all finance nav links", () => {
    const appShell = source("src/components/AppShell.tsx");
    const financeBlock = appShell.slice(
      appShell.indexOf("filteredNavFinance.map"),
      appShell.indexOf("filteredNavOwner.map"),
    );
    assert.match(financeBlock, /prefetch=\{false\}/);
    assert.doesNotMatch(financeBlock, /prefetch=\{true\}/);
  });

  it("renders finance nav once in desktop sidebar only", () => {
    const appShell = source("src/components/AppShell.tsx");
    assert.equal((appShell.match(/filteredNavFinance\.map/g) || []).length, 1);
  });
});

describe("finance chart loading contract", () => {
  it("loads chart.js locally without CDN script tags", () => {
    const chart = source("src/components/finance/FinanceChart.tsx");
    assert.doesNotMatch(chart, /cdn\.jsdelivr\.net/);
    assert.doesNotMatch(chart, /next\/script|<Script/);
    assert.doesNotMatch(chart, /window\.Chart/);
    assert.match(chart, /import\("chart\.js\/auto"\)/);
    assert.match(chart, /canvasRef/);
    assert.match(chart, /\.destroy\(\)/);
  });
});

describe("finance route pages exist", () => {
  for (const route of FINANCE_ROUTES) {
    it(`has page for ${route}`, () => {
      const rel = `src/app${route}/page.tsx`;
      const page = source(rel);
      assert.ok(page.length > 0);
    });
  }
});

describe("finance API read contract", () => {
  it("uses shared GET handler with timeout guard", () => {
    for (const route of [
      "daily-sale",
      "daily-booking",
      "monthly-sale",
      "yearly-sale",
      "ledger",
      "top-performer",
      "category-analysis",
      "inventory-profitability",
      "security-deposit",
      "suppliers",
    ]) {
      const file = source(`src/app/api/finance/${route}/route.ts`);
      assert.match(file, /handleFinanceGet\(/, `${route} should use handleFinanceGet`);
      assert.doesNotMatch(file, /\$transaction|interactiveTransaction/, `${route} must not use interactive tx on reads`);
    }
  });
});

describe("PWA finance cache exclusion", () => {
  it("never caches finance HTML or API via service worker", () => {
    const pwa = source("src/lib/pwaRuntimeCaching.ts");
    assert.ok(pwa.includes("api\\/finance"));
    assert.ok(pwa.includes("finance(?:\\/|$)"));
    assert.ok(pwa.includes("NetworkOnly"));
  });
});

describe("chunk load recovery", () => {
  it("reloads once on ChunkLoadError with sessionStorage guard", () => {
    const mod = source("src/lib/chunkLoadRecovery.ts");
    assert.match(mod, /ChunkLoadError/);
    assert.match(mod, /sessionStorage/);
    assert.match(mod, /fc_chunk_reload_once/);
  });
});

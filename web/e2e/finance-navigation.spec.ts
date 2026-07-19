import { expect, test, type Page, type Request } from "@playwright/test";

const financeRoutes = [
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

const financeNavLabels = [
  "Ledger",
  "Daily Sale",
  "Daily Booking Amount",
  "Monthly Sale",
  "Yearly Sale",
  "Top Performer",
  "Inventory Profitability",
  "Category Analysis",
  "Security Deposit",
  "Suppliers",
];

function pathname(req: Request): string {
  return new URL(req.url()).pathname;
}

function isFinanceRouteRequest(req: Request): boolean {
  const path = pathname(req);
  return path === "/finance" || path.startsWith("/finance/") || path.startsWith("/api/finance/");
}

async function openFinanceNav(page: Page) {
  const toggle = page.locator(".sidebar-mobile-toggle").first();
  if (await toggle.isVisible()) {
    await toggle.click();
  }
}

test.describe("finance navigation hotfix", () => {
  test.skip(!process.env.E2E_STORAGE_STATE, "Set E2E_STORAGE_STATE for authenticated owner session");

  test("dashboard idle does not prefetch finance routes", async ({ page }) => {
    const unexpected: string[] = [];
    const listener = (req: Request) => {
      if (isFinanceRouteRequest(req)) unexpected.push(req.url());
    };

    await page.goto("/", { waitUntil: "networkidle" });
    page.on("request", listener);
    await page.waitForTimeout(5_000);
    page.off("request", listener);

    expect(unexpected, `unexpected finance requests:\n${unexpected.join("\n")}`).toEqual([]);
  });

  test("clicking Daily Sale loads only that finance route", async ({ page }) => {
    const financeRequests: string[] = [];
    const listener = (req: Request) => {
      if (isFinanceRouteRequest(req)) financeRequests.push(pathname(req));
    };

    await page.goto("/", { waitUntil: "networkidle" });
    await openFinanceNav(page);
    page.on("request", listener);

    await page.getByRole("link", { name: "Daily Sale" }).click();
    await expect(page).toHaveURL(/\/finance\/daily-sale/);
    await page.waitForLoadState("networkidle");
    page.off("request", listener);

    const unique = [...new Set(financeRequests)];
    expect(unique.every((p) => p.startsWith("/finance/daily-sale") || p.startsWith("/api/finance/daily-sale"))).toBeTruthy();
  });

  test("does not request chart.js CDN", async ({ page }) => {
    const blocked: string[] = [];
    page.on("request", (req) => {
      if (/cdn\.jsdelivr\.net/i.test(req.url())) blocked.push(req.url());
    });

    await page.goto("/finance/daily-sale", { waitUntil: "networkidle" });
    await page.waitForTimeout(2_000);
    expect(blocked).toEqual([]);
  });

  for (const label of financeNavLabels) {
    test(`desktop nav loads ${label}`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "desktop-chromium", "Desktop nav coverage");
      const errors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
      });

      await page.goto("/", { waitUntil: "networkidle" });
      await openFinanceNav(page);
      await page.getByRole("link", { name: label }).click();
      await expect(page).toHaveURL(new RegExp(financeRoutes[financeNavLabels.indexOf(label)]));
      await page.waitForLoadState("networkidle");

      const critical = errors.filter(
        (e) =>
          !/favicon|404.*\.map|DevTools|Failed to load resource.*404/i.test(e),
      );
      expect(critical).toEqual([]);
    });
  }

  for (const label of financeNavLabels) {
    test(`mobile nav loads ${label}`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "mobile-chromium", "Mobile nav coverage");
      await page.goto("/", { waitUntil: "networkidle" });
      await openFinanceNav(page);
      await page.getByRole("link", { name: label }).click();
      await expect(page).toHaveURL(new RegExp(financeRoutes[financeNavLabels.indexOf(label)]));
    });
  }

  test("/finance redirects to ledger", async ({ page }) => {
    await page.goto("/finance", { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/finance\/ledger/);
  });
});

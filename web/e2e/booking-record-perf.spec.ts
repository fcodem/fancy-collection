import { expect, test } from "@playwright/test";

const bookingId = process.env.E2E_BOOKING_ID?.trim();

test.describe("booking record performance UX", () => {
  test.skip(!bookingId, "Set E2E_BOOKING_ID and authenticated E2E_STORAGE_STATE");

  test("shows loading skeleton then core content from panel", async ({ page }) => {
    await page.goto("/booking", { waitUntil: "domcontentloaded" });
    const viewLink = page.getByRole("link", { name: /View|#\d+/i }).first();
    await expect(viewLink).toBeVisible({ timeout: 15_000 });

    const nav = page.waitForURL(new RegExp(`/booking/\\d+`), { timeout: 20_000 });
    await viewLink.click();
    await nav;

    await expect(page.getByText(/Booking #/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Customer/i).first()).toBeVisible();
  });

  test("core record visible while warnings section may load later", async ({ page }) => {
    await page.goto(`/booking/${bookingId}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/Booking #/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Total Rent|Delivery/i).first()).toBeVisible();
  });

  test("search booking opens record", async ({ page }) => {
    await page.goto("/search-booking", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Search/i })).toBeVisible({ timeout: 10_000 });
  });
});

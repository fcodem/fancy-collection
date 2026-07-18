import { expect, test, type Page, type Request } from "@playwright/test";

const bookingId = process.env.E2E_BOOKING_ID?.trim();
const qrUrl = process.env.E2E_QR_URL?.trim();

const unrelatedRoutePrefixes = bookingId
  ? [
      `/jewellery-selection/${bookingId}`,
      `/booking-delivery/${bookingId}`,
      `/return/${bookingId}`,
      `/booking/${bookingId}/customer-slips`,
      `/booking/${bookingId}/slip`,
      `/booking/${bookingId}/delivery-slip`,
      `/booking/${bookingId}/return-slip`,
      `/booking/${bookingId}/incomplete-slip`,
      `/booking/${bookingId}/edit`,
      `/postponed-booking/${bookingId}`,
    ]
  : [];

function pathname(req: Request): string {
  return new URL(req.url()).pathname;
}

async function assertIdleBookingDoesNotPrefetchActions(page: Page) {
  const unexpected: string[] = [];
  const listener = (req: Request) => {
    const path = pathname(req);
    if (unrelatedRoutePrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
      unexpected.push(req.url());
    }
  };

  // Attach only after the visible booking has loaded so its own navigation/RSC
  // request is not counted as an action-route prefetch.
  page.on("request", listener);
  await page.waitForTimeout(5_000);
  page.off("request", listener);
  expect(unexpected, `unexpected action-route requests:\n${unexpected.join("\n")}`).toEqual([]);
}

test.describe("booking record request isolation", () => {
  test.skip(!bookingId, "Set E2E_BOOKING_ID and authenticated E2E_STORAGE_STATE");

  test("idle booking detail does not request unrelated actions", async ({ page }) => {
    await page.goto(`/booking/${bookingId}`, { waitUntil: "networkidle" });
    await expect(page.getByText(/Booking #/)).toBeVisible();
    await assertIdleBookingDoesNotPrefetchActions(page);
  });

  test("Edit prefetches only on desktop intent and still navigates", async (
    { page },
    testInfo,
  ) => {
    await page.goto(`/booking/${bookingId}`, { waitUntil: "networkidle" });
    const edit = page.getByRole("link", { name: /Edit/ }).first();
    await expect(edit).toBeVisible();

    if (testInfo.project.name === "desktop-chromium") {
      const prefetch = page.waitForRequest(
        (req) =>
          pathname(req) === `/booking/${bookingId}/edit` &&
          new URL(req.url()).searchParams.has("_rsc"),
        { timeout: 5_000 },
      );
      await edit.hover();
      await prefetch;
    }

    await edit.click();
    await expect(page).toHaveURL(new RegExp(`/booking/${bookingId}/edit`));
  });

  test("QR arrival has the same idle request isolation", async ({ page }) => {
    test.skip(!qrUrl, "Set E2E_QR_URL to a valid signed QR URL");
    await page.goto(qrUrl!, { waitUntil: "networkidle" });
    await expect(page).toHaveURL(new RegExp(`/booking/${bookingId}$`));
    await assertIdleBookingDoesNotPrefetchActions(page);
  });
});

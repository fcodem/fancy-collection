import { expect, test, type Page, type Request } from "@playwright/test";

const hasAuthState = Boolean(process.env.E2E_STORAGE_STATE?.trim());
const SCANNER_HREF = "/inventory/search/scan?mode=scan-availability";
const MOCK_BOOKING_ID = 900;

type MockStatus =
  | "AVAILABLE"
  | "BOOKED"
  | "WARNING_RETURNING_ON_DELIVERY_DAY";

function apiResult(code: string, status: MockStatus) {
  const warningReason = "RETURNING_ON_DELIVERY_DAY";
  const record = {
    bookingId: MOCK_BOOKING_ID,
    bookingNumber: "BK-0726-120",
    monthlySerial: 120,
    customerName: "Customer",
    contact: "9812345678",
    dressName: `Dress ${code}`,
    deliveryDateTime: "2026-07-28 11:00 AM",
    returnDateTime: "2026-07-30 11:00 AM",
    bookingStatus: "booked",
    itemStatus: "booked",
    reason: status === "BOOKED" ? "OVERLAPPING_BOOKING" : warningReason,
  };
  return {
    ok: true,
    status,
    dress: {
      id: [...code].reduce((sum, char) => sum + char.charCodeAt(0), 0),
      name: `Dress ${code}`,
      sku: `SKU-${code}`,
      category: "Lehenga",
      size: "40",
      colour: "Red",
      status: "available",
      thumbnailUrl: null,
    },
    blockingRecords: status === "BOOKED" ? [record] : [],
    warningRecords: status.startsWith("WARNING_") ? [record] : [],
    timing: { totalMs: 12, cacheStatus: "miss" },
  };
}

async function mockDecode(page: Page, code: string) {
  await page.evaluate((value) => {
    window.dispatchEvent(
      new CustomEvent("dress-scan-mock", { detail: { code: value } }),
    );
  }, code);
}

async function enterWindow(page: Page, delivery = "2026-07-28") {
  const setField = async (label: string, value: string) => {
    const input = page.getByLabel(label);
    await input.fill(value);
    if ((await input.inputValue()) !== value) await input.fill(value);
    await expect(input).toHaveValue(value);
  };
  await setField("Delivery Time", "16:00");
  await setField("Return Date", "2026-07-30");
  await setField("Return Time", "11:00");
  await setField("Delivery Date", delivery);
  await page.getByRole("button", { name: "Start Scanning" }).click();
  await expect(page.getByTestId("dress-availability-camera")).toBeVisible();
}

function pathname(req: Request): string {
  return new URL(req.url()).pathname;
}

test.describe("Scan Dress Availability dashboard access", () => {
  test.skip(!hasAuthState, "Set authenticated E2E_STORAGE_STATE");

  test.beforeEach(async ({ page }) => {
    await page.route("**/api/dress-checker/scan-availability", async (route) => {
      const body = route.request().postDataJSON() as { code: string };
      const code = body.code;
      const status: MockStatus =
        code === "BOOKED"
          ? "BOOKED"
          : code === "RETURNING"
            ? "WARNING_RETURNING_ON_DELIVERY_DAY"
            : "AVAILABLE";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(apiResult(code, status)),
      });
    });
  });

  test("dashboard displays Scan Dress Availability card", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("scan-dress-availability-card")).toBeVisible();
    await expect(page.getByText("Scan Dress Availability")).toBeVisible();
    await expect(
      page.getByText(/check whether it is available between selected delivery and return dates/i),
    ).toBeVisible();
  });

  test("clicking Open Scanner opens scan-availability mode without camera", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Open Scanner" }).click();
    await expect(page).toHaveURL(/\/inventory\/search\/scan\?mode=scan-availability/);
    await expect(page.locator('[data-scan-mode="scan-availability"]')).toBeVisible();
    await expect(page.getByTestId("dress-availability-camera")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /Enter booking window/i })).toBeVisible();
  });

  test("camera does not open before dates entered on scanner route", async ({
    page,
  }) => {
    await page.goto(SCANNER_HREF);
    await expect(page.getByTestId("dress-availability-camera")).toHaveCount(0);
    await expect(page.getByLabel("Delivery Date")).toBeVisible();
  });

  test("booked scan shows Open Booking Record without prefetching booking route", async ({
    page,
  }) => {
    const unexpected: string[] = [];
    const listener = (req: Request) => {
      const path = pathname(req);
      if (path === `/booking/${MOCK_BOOKING_ID}` || path.startsWith(`/booking/${MOCK_BOOKING_ID}/`)) {
        unexpected.push(req.url());
      }
    };

    await page.goto(SCANNER_HREF);
    page.on("request", listener);
    await enterWindow(page);
    await mockDecode(page, "BOOKED");
    await expect(page.getByTestId("open-booking-record")).toBeVisible();
    await page.waitForTimeout(1_500);
    page.off("request", listener);
    expect(unexpected).toEqual([]);
  });

  test("clicking Open Booking Record opens the correct booking", async ({ page }) => {
    await page.goto(SCANNER_HREF);
    await enterWindow(page);
    await mockDecode(page, "BOOKED");
    await page.getByTestId("open-booking-record").click();
    await expect(page).toHaveURL(new RegExp(`/booking/${MOCK_BOOKING_ID}$`));
  });

  test("warning records also show booking actions", async ({ page }) => {
    await page.goto(SCANNER_HREF);
    await enterWindow(page);
    await mockDecode(page, "RETURNING");
    await expect(page.getByTestId("open-booking-record")).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Delivery" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Jewellery Selection" })).toBeVisible();
  });

  test("back navigation preserves dates and scan results", async ({ page }) => {
    await page.goto(SCANNER_HREF);
    await enterWindow(page);
    await mockDecode(page, "BOOKED");
    await expect(page.getByText("Dress BOOKED")).toBeVisible();

    await page.getByTestId("open-booking-record").click();
    await expect(page).toHaveURL(new RegExp(`/booking/${MOCK_BOOKING_ID}$`));
    await page.goBack();
    await expect(page).toHaveURL(/\/inventory\/search\/scan/);
    await expect(page.getByText("Dress BOOKED")).toBeVisible();
    await expect(page.getByLabel("Delivery Date")).toHaveValue("2026-07-28");
  });
});

test.describe("Scan Dress Availability dashboard access (mobile)", () => {
  test.skip(!hasAuthState, "Set authenticated E2E_STORAGE_STATE");
  test.use({ viewport: { width: 390, height: 844 } });

  test("mobile dashboard card opens scanner mode", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("scan-dress-availability-card")).toBeVisible();
    await page.getByRole("link", { name: "Open Scanner" }).click();
    await expect(page).toHaveURL(/mode=scan-availability/);
    await expect(page.getByTestId("dress-availability-camera")).toHaveCount(0);
  });
});

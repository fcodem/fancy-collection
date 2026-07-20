import { expect, test, type Page } from "@playwright/test";

const hasAuthState = Boolean(process.env.E2E_STORAGE_STATE?.trim());

type MockStatus =
  | "AVAILABLE"
  | "BOOKED"
  | "WARNING_RETURNING_ON_DELIVERY_DAY"
  | "WARNING_BOOKED_ON_RETURN_DAY";

function apiResult(code: string, status: MockStatus) {
  const warningReason =
    status === "WARNING_RETURNING_ON_DELIVERY_DAY"
      ? "RETURNING_ON_DELIVERY_DAY"
      : "BOOKED_ON_RETURN_DAY";
  const record = {
    bookingId: 900,
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
    // WebKit date inputs can occasionally drop a programmatic fill while
    // several mobile projects start in parallel. Verify before submitting.
    if ((await input.inputValue()) !== value) await input.fill(value);
    await expect(input).toHaveValue(value);
  };
  await setField("Delivery Time", "16:00");
  await setField("Return Date", "2026-07-30");
  await setField("Return Time", "11:00");
  // Fill the WebKit date control last: a subsequent controlled-input render
  // can otherwise restore its previous value before React sees the change.
  await setField("Delivery Date", delivery);
  await page.getByRole("button", { name: "Start Scanning" }).click();
  await expect(page.getByTestId("dress-availability-camera")).toBeVisible();
}

test.describe("continuous Scan Dress Availability", () => {
  test.skip(!hasAuthState, "Set authenticated E2E_STORAGE_STATE");

  test.beforeEach(async ({ page }) => {
    await page.route("**/api/dress-checker/scan-availability", async (route) => {
      const body = route.request().postDataJSON() as { code: string };
      const code = body.code;
      if (code === "SLOW") await new Promise((resolve) => setTimeout(resolve, 350));
      const status: MockStatus =
        code === "BOOKED"
          ? "BOOKED"
          : code === "RETURNING"
            ? "WARNING_RETURNING_ON_DELIVERY_DAY"
            : code === "NEXT"
              ? "WARNING_BOOKED_ON_RETURN_DAY"
              : "AVAILABLE";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(apiResult(code, status)),
      });
    });
  });

  test("scans many dresses without restarting and rejects stale results", async ({
    page,
  }) => {
    await page.goto("/inventory/search/scan");
    await expect(
      page.getByRole("link", { name: "AI / Photo Dress Checker" }),
    ).toBeVisible();
    await expect(page.getByTestId("dress-availability-camera")).toHaveCount(0);

    await enterWindow(page);
    await page.getByTestId("dress-availability-camera").evaluate((element) => {
      element.setAttribute("data-session-marker", "original");
    });

    await mockDecode(page, "AVAILABLE");
    await expect(page.getByText("Available for selected dates")).toBeVisible();

    await mockDecode(page, "BOOKED");
    await expect(page.getByText("Booked during the selected period")).toBeVisible();
    await expect(page.getByText("BK-0726-120").first()).toBeVisible();

    await mockDecode(page, "RETURNING");
    await expect(
      page.getByText(/returning on your delivery date/i),
    ).toBeVisible();

    await mockDecode(page, "NEXT");
    await expect(page.getByText(/another booking on your return date/i)).toBeVisible();

    // Duplicate callbacks cannot create endless rows. After the short callback
    // lock, the session-level dedupe highlights the existing result.
    const countBeforeDuplicate = await page.getByTestId("scan-result").count();
    await page.waitForTimeout(1_550);
    await mockDecode(page, "AVAILABLE");
    await expect(page.getByTestId("scan-feedback")).toContainText("Already scanned");
    await expect(page.getByTestId("scan-result")).toHaveCount(countBeforeDuplicate);

    for (const code of ["FIVE-1", "FIVE-2", "FIVE-3", "FIVE-4", "FIVE-5"]) {
      await mockDecode(page, code);
    }
    await expect(page.getByTestId("scan-result")).toHaveCount(
      countBeforeDuplicate + 5,
    );

    // The camera DOM/session remains mounted throughout all successful scans.
    await expect(page.getByTestId("dress-availability-camera")).toHaveAttribute(
      "data-session-marker",
      "original",
    );

    // A late response from the previous date generation is aborted/ignored.
    await mockDecode(page, "SLOW");
    await page.getByRole("button", { name: "Change Dates" }).click();
    await expect(page.getByText(/previous scan results were cleared/i)).toBeVisible();
    await enterWindow(page, "2026-07-29");
    await page.waitForTimeout(450);
    await expect(page.getByText("Dress SLOW")).toHaveCount(0);

    // USB keyboard scanners submit on Enter and the input clears.
    const manual = page.getByLabel("Manual Code Entry");
    await manual.fill("00012345");
    await manual.press("Enter");
    await expect(page.getByText("Dress 00012345")).toBeVisible();
    await expect(manual).toHaveValue("");
  });

  test("camera failure leaves accessible manual scanning available", async ({
    page,
  }) => {
    await page.goto("/inventory/search/scan");
    await enterWindow(page);
    const manual = page.getByLabel("Manual Code Entry");
    await expect(manual).toBeVisible();
    await manual.fill("MANUAL-ONLY");
    await manual.press("Enter");
    await expect(page.getByText("Dress MANUAL-ONLY")).toBeVisible();
  });

  test("returns structured not-linked cards over HTTP 200", async ({ page }) => {
    await page.route("**/api/dress-checker/scan-availability", async (route) => {
      const body = route.request().postDataJSON() as { code: string };
      if (body.code === "UNKNOWN-CODE") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: false,
            status: "CODE_NOT_FOUND",
            dress: null,
            blockingRecords: [],
            warningRecords: [],
            error: "QR/barcode is not linked to inventory.",
          }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto("/inventory/search/scan");
    await enterWindow(page);
    await mockDecode(page, "UNKNOWN-CODE");
    await expect(page.getByText(/not linked to inventory/i)).toBeVisible();
    await expect(page.getByText("NOT LINKED")).toBeVisible();
  });

  test("resolves the LRG-001 legacy fixture without HTTP 404", async ({ page }) => {
    await page.route("**/api/dress-checker/scan-availability", async (route) => {
      const body = route.request().postDataJSON() as { code: string };
      if (body.code === "LRG-001") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            status: "AVAILABLE",
            dress: {
              id: 501,
              name: "Red Bridal Lehenga",
              sku: "LRG-001",
              category: "Lehenga",
              size: "M",
              colour: "Red",
              status: "available",
              thumbnailUrl: null,
            },
            blockingRecords: [],
            warningRecords: [],
            timing: { totalMs: 8, cacheStatus: "miss" },
          }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto("/inventory/search/scan");
    await enterWindow(page);
    await mockDecode(page, "LRG-001");
    await expect(page.getByText("Red Bridal Lehenga")).toBeVisible();
    await expect(page.getByText(/LRG-001 · Size M/i)).toBeVisible();
    await expect(page.getByText("Available for selected dates")).toBeVisible();
  });
});

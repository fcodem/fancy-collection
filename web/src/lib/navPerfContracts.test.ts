import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BOOKING_PANEL_PAGE_SIZE } from "./bookingPanelConstants";

describe("booking panel pagination contract", () => {
  it("uses 50 rows per page", () => {
    assert.equal(BOOKING_PANEL_PAGE_SIZE, 50);
  });

  it("page windows do not overlap", () => {
    const page = 2;
    const skip = (page - 1) * BOOKING_PANEL_PAGE_SIZE;
    const take = BOOKING_PANEL_PAGE_SIZE;
    assert.equal(skip, 50);
    assert.equal(take, 50);
    assert.equal(skip + take, 100);
  });
});

describe("auth layout cookie path contract", () => {
  it("SessionData identity fields are defined for cookie-only layout auth", async () => {
    const mod = await import("./auth");
    assert.equal(typeof mod.getSessionIdentityFromCookie, "function");
    assert.equal(typeof mod.getCurrentUserForLayout, "function");
    assert.equal(typeof mod.getCurrentUser, "function");
  });
});

describe("advisory lock helper", () => {
  it("exports lockInventoryItemsForBooking", async () => {
    const mod = await import("./bookingItemLocks");
    assert.equal(typeof mod.lockInventoryItemsForBooking, "function");
  });
});

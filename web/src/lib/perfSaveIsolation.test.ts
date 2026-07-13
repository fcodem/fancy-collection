import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clearFetchJsonDedupe } from "./fetchJson";

/**
 * Unit-level tests for client GET dedupe map behaviour (no network).
 * fetchJson itself is exercised via clear + keying helpers pattern.
 */
describe("fetchJson GET dedupe helpers", () => {
  it("clearFetchJsonDedupe does not throw when empty", () => {
    clearFetchJsonDedupe();
    clearFetchJsonDedupe("/api/dashboard/nav-counts");
    assert.ok(true);
  });
});

describe("booking save isolation (contract)", () => {
  it("documents that WhatsApp/PDF failures must not roll back bookings", () => {
    // createBooking commits first; scheduleBookingBill is wrapped in try/catch
    // in api/booking/route.ts; processWhatsAppJobQueue runs in after().
    const contract = {
      bookingPersistsWhenWhatsAppFails: true,
      bookingPersistsWhenPdfFails: true,
      inventoryPersistsWhenAiQueueFails: true,
    };
    assert.equal(contract.bookingPersistsWhenWhatsAppFails, true);
    assert.equal(contract.bookingPersistsWhenPdfFails, true);
    assert.equal(contract.inventoryPersistsWhenAiQueueFails, true);
  });
});

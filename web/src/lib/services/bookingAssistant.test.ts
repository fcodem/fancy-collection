import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseAssistantQuery,
  computeExtendedRange,
  computeMovedRange,
  mapAvailability,
  combineStatus,
  type EngineResult,
  type EngineFreeItem,
} from "./bookingAssistant";

const TODAY = "2026-07-04"; // A Saturday.

const ITEM = { id: 1, display_name: "Red Sherwani", name: "Red Sherwani", sku: "LR-102", category: "Sherwani" };
const RANGE = { delivery: "2026-07-20", return: "2026-07-23" };

function engine(freeItems: EngineFreeItem[]): EngineResult {
  return { free_items: freeItems, returning_on_delivery: [], booked_on_return: [] };
}

// ---------------------------------------------------------------------------
// Natural-language parser
// ---------------------------------------------------------------------------

describe("parseAssistantQuery — dates & entities", () => {
  it("parses 'X July to Y July'", () => {
    const p = parseAssistantQuery("Is the red Sherwani available from 20 July to 23 July?", TODAY);
    assert.deepEqual(p.range, { delivery: "2026-07-20", return: "2026-07-23" });
    assert.equal(p.intent, "availability");
    assert.match(p.itemQuery ?? "", /red sherwani/);
  });

  it("parses '15 August to 18 August'", () => {
    const p = parseAssistantQuery("book LR-102 15 August to 18 August", TODAY);
    assert.deepEqual(p.range, { delivery: "2026-08-15", return: "2026-08-18" });
    assert.equal(p.sku, "LR-102");
  });

  it("parses shared-month '20 to 23 July'", () => {
    const p = parseAssistantQuery("free 20 to 23 July?", TODAY);
    assert.deepEqual(p.range, { delivery: "2026-07-20", return: "2026-07-23" });
  });

  it("parses relative 'tomorrow' as a single day", () => {
    const p = parseAssistantQuery("Is the gown free tomorrow", TODAY);
    assert.deepEqual(p.range, { delivery: "2026-07-05", return: "2026-07-05" });
  });

  it("parses 'this weekend'", () => {
    const p = parseAssistantQuery("anything free this weekend", TODAY);
    assert.deepEqual(p.range, { delivery: "2026-07-04", return: "2026-07-05" });
  });

  it("parses explicit ISO dates", () => {
    const p = parseAssistantQuery("check 2026-09-01 to 2026-09-03", TODAY);
    assert.deepEqual(p.range, { delivery: "2026-09-01", return: "2026-09-03" });
  });

  it("extracts a booking reference (#145)", () => {
    const p = parseAssistantQuery("show booking #145", TODAY);
    assert.equal(p.bookingRef, 145);
  });

  it("detects an extend request with day count", () => {
    const p = parseAssistantQuery("extend booking #145 by two days", TODAY);
    assert.equal(p.intent, "extend");
    assert.equal(p.bookingRef, 145);
    assert.equal(p.extendDays, 2);
  });

  it("detects a move/conflict request with target date", () => {
    const p = parseAssistantQuery("will booking #245 conflict if moved to 18 July?", TODAY);
    assert.equal(p.intent, "move");
    assert.equal(p.bookingRef, 245);
    assert.equal(p.moveTo, "2026-07-18");
  });

  it("flags an invalid range (return before pickup)", () => {
    const p = parseAssistantQuery("book it 23 July to 20 July", TODAY);
    assert.equal(p.range, null);
    assert.ok(p.error);
  });

  it("returns null range when no dates are present", () => {
    const p = parseAssistantQuery("Is the red gown available", TODAY);
    assert.equal(p.range, null);
    assert.equal(p.error, null);
    assert.match(p.itemQuery ?? "", /red gown/);
  });

  it("extracts an explicit customer name", () => {
    const p = parseAssistantQuery("check customer Rahul Sharma booking", TODAY);
    assert.equal(p.customerName, "Rahul Sharma");
  });

  it("does not treat a month word as a customer name", () => {
    const p = parseAssistantQuery("is it free for 20 July to 23 July", TODAY);
    assert.equal(p.customerName, null);
  });
});

// ---------------------------------------------------------------------------
// Range derivation for extend / move
// ---------------------------------------------------------------------------

describe("computeExtendedRange / computeMovedRange", () => {
  it("extend pushes the return date out, keeping pickup", () => {
    const r = computeExtendedRange({ deliveryDate: "2026-07-20", returnDate: "2026-07-23" }, 2);
    assert.deepEqual(r, { delivery: "2026-07-20", return: "2026-07-25" });
  });

  it("move shifts pickup and preserves the original duration", () => {
    const r = computeMovedRange({ deliveryDate: "2026-07-15", returnDate: "2026-07-18" }, "2026-07-20");
    assert.deepEqual(r, { delivery: "2026-07-20", return: "2026-07-23" });
  });
});

// ---------------------------------------------------------------------------
// Answer mapping — faithfully reflects the engine output (no re-derivation)
// ---------------------------------------------------------------------------

describe("mapAvailability — engine output → status", () => {
  it("Available when the item is in free_items with no warnings", () => {
    const a = mapAvailability({ item: ITEM, range: RANGE, engine: engine([{ id: 1 }]) });
    assert.equal(a.status, "available");
    assert.equal(a.warnings.length, 0);
    assert.equal(a.conflict, null);
  });

  it("Available with Warning — booking ends on an existing delivery day (booked_warning)", () => {
    const a = mapAvailability({
      item: ITEM,
      range: RANGE,
      engine: engine([
        { id: 1, booked_warning: { serial_no: 5, customer_name: "Asha", delivery_date: "23 Jul 2026", return_date: "25 Jul 2026" } },
      ]),
    });
    assert.equal(a.status, "available_with_warning");
    assert.equal(a.warnings[0].type, "booked_on_return");
    assert.equal(a.warnings[0].booking?.serial_no, 5);
  });

  it("Available with Warning — booking starts on an existing return day (returning_warning)", () => {
    const a = mapAvailability({
      item: ITEM,
      range: RANGE,
      engine: engine([
        { id: 1, returning_warning: { serial_no: 8, customer_name: "Meera", delivery_date: "18 Jul 2026", return_date: "20 Jul 2026" } },
      ]),
    });
    assert.equal(a.status, "available_with_warning");
    assert.equal(a.warnings[0].type, "returning_on_delivery");
    assert.equal(a.warnings[0].booking?.serial_no, 8);
  });

  it("Not Available on exact overlap (item absent), surfacing the blocking booking", () => {
    const a = mapAvailability({
      item: ITEM,
      range: RANGE,
      engine: engine([]),
      blocking: { booking_id: 99, serial_no: 7, customer: "Ravi", delivery_date: "2026-07-20", return_date: "2026-07-23" },
    });
    assert.equal(a.status, "not_available");
    assert.equal(a.conflict?.serial_no, 7);
    assert.equal(a.conflict?.customer, "Ravi");
  });

  it("Not Available on partial/interior overlap (item absent)", () => {
    const a = mapAvailability({
      item: ITEM,
      range: RANGE,
      engine: engine([]),
      blocking: { booking_id: 11, serial_no: 3, customer: "Sana", delivery_date: "2026-07-21", return_date: "2026-07-22" },
    });
    assert.equal(a.status, "not_available");
    assert.equal(a.conflict?.serial_no, 3);
  });

  it("Not Available with multiple overlaps reflects the engine's blocking record", () => {
    const a = mapAvailability({
      item: ITEM,
      range: RANGE,
      engine: engine([]),
      blocking: { booking_id: 21, serial_no: 12, customer: "Nita", delivery_date: "2026-07-19", return_date: "2026-07-24" },
    });
    assert.equal(a.status, "not_available");
    assert.equal(a.conflict?.serial_no, 12);
  });

  it("Not Available still returns a generic reason when no blocking detail is provided", () => {
    const a = mapAvailability({ item: ITEM, range: RANGE, engine: engine([]) });
    assert.equal(a.status, "not_available");
    assert.ok(a.conflict?.reason);
  });

  it("cancelled bookings are ignored — engine reports the item free → Available", () => {
    // A cancelled booking is excluded by the engine, so the item appears in free_items.
    const a = mapAvailability({ item: ITEM, range: RANGE, engine: engine([{ id: 1 }]) });
    assert.equal(a.status, "available");
  });

  it("jewellery partial availability maps to Available with Warning", () => {
    const a = mapAvailability({
      item: { id: 2, display_name: "Kundan Set", category: "Kundan Jewellery" },
      range: RANGE,
      engine: engine([{ id: 2, item_type: "jewellery", booked_parts: ["necklace"], available_parts: ["earrings", "teeka"] }]),
    });
    assert.equal(a.status, "available_with_warning");
    assert.equal(a.warnings[0].type, "jewellery_parts");
  });

  it("suggests similar available dresses from the same engine result when blocked", () => {
    const a = mapAvailability({
      item: ITEM,
      range: RANGE,
      engine: engine([
        { id: 5, display_name: "Blue Sherwani", sku: "LR-200", category: "Sherwani" },
        { id: 6, display_name: "Green Gown", sku: "GW-9", category: "Gown" },
      ]),
    });
    assert.equal(a.status, "not_available");
    assert.equal(a.suggestions.length, 1);
    assert.equal(a.suggestions[0].id, 5);
  });

  it("adds a historical note for past dates but still reports the engine result", () => {
    const a = mapAvailability({
      item: ITEM,
      range: { delivery: "2026-06-01", return: "2026-06-03" },
      engine: engine([{ id: 1 }]),
      todayIso: TODAY,
    });
    assert.equal(a.status, "available");
    assert.ok(a.notes.some((n) => /historical/i.test(n)));
  });
});

describe("combineStatus", () => {
  it("returns not_found for no answers", () => {
    assert.equal(combineStatus([]), "not_found");
  });
  it("worst status wins", () => {
    const base = { item: ITEM, range: RANGE, headline: "", warnings: [], conflict: null, suggestions: [], notes: [] };
    assert.equal(
      combineStatus([
        { ...base, status: "available" },
        { ...base, status: "not_available" },
      ]),
      "not_available",
    );
    assert.equal(
      combineStatus([
        { ...base, status: "available" },
        { ...base, status: "available_with_warning" },
      ]),
      "available_with_warning",
    );
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { groupDashboardPrintByDivision, groupPrintDressesByCategory } from "./dashboardPrintGrouping";
import type { PrintBookingRecord, PrintDressRow } from "./dashboardPrintTypes";

function dress(partial: Partial<PrintDressRow> & Pick<PrintDressRow, "label" | "category">): PrintDressRow {
  return {
    price: 1000,
    fitting: 0,
    advance: 500,
    remaining: 500,
    notes: "",
    deliveryNote: "",
    remainingCollected: 0,
    securityCollected: 0,
    status: "Pending delivery",
    ...partial,
  };
}

function booking(
  id: number,
  serial: string,
  customerName: string,
  dresses: PrintDressRow[],
): PrintBookingRecord {
  return {
    id,
    serial,
    customerName,
    address: "",
    contact1: "",
    contact2: "",
    whatsapp: "",
    venue: "",
    staffNames: "",
    bookedOn: "",
    deliveryDate: "01/12/2026",
    deliveryTime: "6:00 PM",
    returnDate: "03/12/2026",
    returnTime: "12:00 Noon",
    deliveredAt: "",
    isOverdue: false,
    status: "booked",
    commonNotes: "",
    deliveryNotes: "",
    dresses,
    orders: [],
    totalRent: 1000,
    totalFitting: 0,
    totalAdvance: 500,
    advanceMode: "cash",
    totalRemaining: 500,
    remainingCollected: 0,
    remainingMode: "",
    balanceLeft: 500,
    securityDeposit: 2000,
    securityCollected: 0,
    securityMode: "",
  };
}

describe("groupDashboardPrintByDivision", () => {
  it("puts women and jewellery in separate sections in print order", () => {
    const records = [
      booking(84, "84", "JYOTI", [dress({ label: "OFF WHITE PEACOCK", category: "Crop Top" })]),
      booking(99, "99", "AKANSHA", [dress({ label: "BRIDAL GREEN MIRROR", category: "Bridal Jewellery" })]),
      booking(124, "124", "MAYA", [dress({ label: "ONION BRIDAL", category: "Crop Top" })]),
      booking(10, "10", "RAJ", [dress({ label: "ROYAL SHERWANI", category: "Sherwani" })]),
    ];
    const sections = groupDashboardPrintByDivision(records);
    assert.deepEqual(
      sections.map((s) => s.label),
      ["1. Mens", "2. Women", "3. Jewellery"],
    );
    assert.deepEqual(
      sections[0]!.records.map((r) => r.serial),
      ["10"],
    );
    assert.deepEqual(
      sections[1]!.records.map((r) => r.serial),
      ["84", "124"],
    );
    assert.deepEqual(
      sections[2]!.records.map((r) => r.serial),
      ["99"],
    );
  });

  it("groups dress rows by category inside a card", () => {
    const groups = groupPrintDressesByCategory([
      dress({ label: "INDO A", category: "Indowestern" }),
      dress({ label: "SHER B", category: "Sherwani" }),
      dress({ label: "INDO C", category: "Indowestern" }),
    ]);
    assert.deepEqual(
      groups.map((g) => g.category),
      ["Sherwani", "Indowestern"],
    );
  });
});

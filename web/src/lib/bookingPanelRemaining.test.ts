import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  unpaidBalanceAfterDelivery,
  bookingSecurityDisplayAmount,
  undoubleRepeatedDepositSecurity,
  effectiveSecurityCollected,
  securityCurrentlyHeld,
} from "./bookingDetails";
import { preferDistinctDressSizes } from "./mensAvailabilityCollapse";
import { initialDeliveryItemForms } from "../components/DeliveryDetailClient";

describe("unpaidBalanceAfterDelivery", () => {
  it("shows Paid when remaining was collected at delivery", () => {
    assert.equal(
      unpaidBalanceAfterDelivery({
        totalRemaining: 1600,
        remainingCollected: 1600,
      }),
      0,
    );
  });

  it("uses per-item collection when booking total was not synced", () => {
    assert.equal(
      unpaidBalanceAfterDelivery({
        totalRemaining: 1600,
        remainingCollected: 0,
        bookingItems: [{ itemRemainingCollected: 1600 }],
      }),
      0,
    );
  });

  it("keeps leftover when only part was collected", () => {
    assert.equal(
      unpaidBalanceAfterDelivery({
        totalRemaining: 1600,
        remainingCollected: 600,
      }),
      1000,
    );
  });

  it("subtracts remaining even when security collected matches that amount", () => {
    assert.equal(
      unpaidBalanceAfterDelivery({
        totalRemaining: 700,
        remainingCollected: 600,
        securityCollected: 600,
        securityDeposit: 0,
      }),
      100,
    );
  });

  it("still subtracts when remaining, security, and deposit amounts match", () => {
    assert.equal(
      unpaidBalanceAfterDelivery({
        totalRemaining: 700,
        remainingCollected: 600,
        securityCollected: 600,
        securityDeposit: 600,
      }),
      100,
    );
  });
});

describe("undoubleRepeatedDepositSecurity", () => {
  it("collapses N× deposit when every dress was prefilled with the full deposit", () => {
    assert.equal(
      undoubleRepeatedDepositSecurity(4000, 2000, [
        { itemSecurityCollected: 2000 },
        { itemSecurityCollected: 2000 },
      ]),
      2000,
    );
  });

  it("collapses booking-level N× deposit when per-item amounts are missing", () => {
    assert.equal(undoubleRepeatedDepositSecurity(4000, 2000, [{}, {}]), 2000);
  });

  it("keeps genuine multi-dress security that is not a repeated deposit", () => {
    assert.equal(
      undoubleRepeatedDepositSecurity(3000, 2000, [
        { itemSecurityCollected: 1500 },
        { itemSecurityCollected: 1500 },
      ]),
      3000,
    );
  });
});

describe("effectiveSecurityCollected", () => {
  it("undoubles summed item security against the booking deposit", () => {
    assert.equal(
      effectiveSecurityCollected(
        4000,
        [{ itemSecurityCollected: 2000 }, { itemSecurityCollected: 2000 }],
        2000,
      ),
      2000,
    );
  });
});

describe("bookingSecurityDisplayAmount", () => {
  it("shows booking deposit before delivery", () => {
    assert.equal(
      bookingSecurityDisplayAmount({
        status: "booked",
        securityDeposit: 5000,
        securityCollected: 0,
      }),
      5000,
    );
  });

  it("shows delivery-collected security after delivery, not booking deposit", () => {
    assert.equal(
      bookingSecurityDisplayAmount({
        status: "delivered",
        securityDeposit: 5000,
        securityCollected: 2000,
      }),
      2000,
    );
  });

  it("shows zero after delivery when nothing was collected at delivery", () => {
    assert.equal(
      bookingSecurityDisplayAmount({
        status: "delivered",
        securityDeposit: 5000,
        securityCollected: 0,
      }),
      0,
    );
  });

  it("uses per-item security collected when booking total was not synced", () => {
    assert.equal(
      bookingSecurityDisplayAmount({
        status: "booked",
        securityDeposit: 5000,
        securityCollected: 0,
        items: [{ itemSecurityCollected: 1500, isDelivered: true }],
      }),
      1500,
    );
  });

  it("undoubles repeated deposit on delivered multi-dress bookings", () => {
    assert.equal(
      bookingSecurityDisplayAmount({
        status: "delivered",
        securityDeposit: 2000,
        securityCollected: 4000,
        items: [
          { itemSecurityCollected: 2000, isDelivered: true },
          { itemSecurityCollected: 2000, isDelivered: true },
        ],
      }),
      2000,
    );
  });
});

describe("securityCurrentlyHeld", () => {
  it("shows undoubled security for delivered multi-dress bookings", () => {
    assert.equal(
      securityCurrentlyHeld({
        status: "delivered",
        securityHeld: 4000,
        securityCollected: 4000,
        securityDeposit: 2000,
        items: [
          { itemSecurityCollected: 2000, isDelivered: true },
          { itemSecurityCollected: 2000, isDelivered: true },
        ],
      }),
      2000,
    );
  });
});

describe("initialDeliveryItemForms", () => {
  it("prefills booking deposit on the first dress only", () => {
    const items = [
      {
        id: 1,
        dressName: "A",
        price: 1800,
        remaining: 500,
        isDelivered: false,
        itemRemainingCollected: 0,
        itemSecurityCollected: 0,
        itemDeliveryNotes: "",
      },
      {
        id: 2,
        dressName: "B",
        price: 1500,
        remaining: 500,
        isDelivered: false,
        itemRemainingCollected: 0,
        itemSecurityCollected: 0,
        itemDeliveryNotes: "",
      },
    ];
    const forms = initialDeliveryItemForms(items, 2000);
    assert.equal(forms[1].security, "2000");
    assert.equal(forms[2].security, "");
  });
});

describe("preferDistinctDressSizes", () => {
  it("keeps every sherwani size instead of repeating the same size", () => {
    const rows = [
      { name: "HIGHLIGHT", category: "Sherwani", size: "40" },
      { name: "HIGHLIGHT #2", category: "Sherwani", size: "40" },
      { name: "HIGHLIGHT", category: "Sherwani", size: "42" },
      { name: "HIGHLIGHT", category: "Sherwani", size: "38" },
    ];
    const out = preferDistinctDressSizes(rows, 3);
    assert.deepEqual(
      out.map((r) => r.size),
      ["40", "42", "38"],
    );
  });
});

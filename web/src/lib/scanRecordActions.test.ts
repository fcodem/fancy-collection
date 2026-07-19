import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canOpenDelivery,
  canOpenJewellerySelection,
  canOpenReturn,
  scanRecordReasonLabel,
} from "./scanRecordActions";

describe("scan record contextual actions", () => {
  it("labels blocking and warning reasons", () => {
    assert.match(
      scanRecordReasonLabel("OVERLAPPING_BOOKING"),
      /overlapping booking/i,
    );
    assert.match(
      scanRecordReasonLabel("RETURNING_ON_DELIVERY_DAY"),
      /returning on delivery date/i,
    );
    assert.match(
      scanRecordReasonLabel("BOOKED_ON_RETURN_DAY"),
      /booked on return date/i,
    );
  });

  it("shows delivery and jewellery links for booked bookings", () => {
    const booked = { bookingId: 1, bookingStatus: "booked", itemStatus: "booked" };
    assert.equal(canOpenDelivery(booked), true);
    assert.equal(canOpenJewellerySelection(booked), true);
    assert.equal(canOpenReturn(booked), false);
  });

  it("shows return link when booking or item is delivered", () => {
    assert.equal(
      canOpenReturn({
        bookingId: 2,
        bookingStatus: "delivered",
        itemStatus: "booked",
      }),
      true,
    );
    assert.equal(
      canOpenReturn({
        bookingId: 3,
        bookingStatus: "booked",
        itemStatus: "delivered",
      }),
      true,
    );
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildCancellationNoticeMessage,
  cancellationNoticeBodyParams,
  CANCELLATION_NOTICE_TEMPLATE_BODY,
} from "./slipMessageCopy";

describe("cancellation notice", () => {
  const fields = {
    customerName: "Priya",
    publicBookingId: "BK-000042",
    serialNo: "20",
    deliveryDate: "28 Jul 2026",
    returnDate: "29 Jul 2026",
    refundAmount: 1500,
  };

  it("includes booking details and refund amount", () => {
    const msg = buildCancellationNoticeMessage(fields);
    assert.match(msg, /cancelled/i);
    assert.match(msg, /BK-000042/);
    assert.match(msg, /28 Jul 2026/);
    assert.match(msg, /29 Jul 2026/);
    assert.match(msg, /1,500/);
  });

  it("shows no-refund line when refund is zero", () => {
    const msg = buildCancellationNoticeMessage({ ...fields, refundAmount: 0 });
    assert.match(msg, /No refund recorded/i);
  });

  it("builds Meta template body params", () => {
    const params = cancellationNoticeBodyParams(fields);
    assert.deepEqual(params, [
      "Priya",
      "BK-000042 / 20",
      "28 Jul 2026",
      "29 Jul 2026",
      "₹1,500",
    ]);
  });

  it("Meta template body uses five variables", () => {
    assert.match(CANCELLATION_NOTICE_TEMPLATE_BODY, /\{\{1\}\}/);
    assert.match(CANCELLATION_NOTICE_TEMPLATE_BODY, /\{\{5\}\}/);
  });
});

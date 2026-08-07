import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  businessHourNow,
  staffLoginNeedsOwnerApproval,
  STAFF_OPEN_LOGIN_END_HOUR,
  STAFF_OPEN_LOGIN_START_HOUR,
} from "./staffLoginWindow";

describe("staffLoginNeedsOwnerApproval", () => {
  it("allows staff without approval during 10:00–20:59 IST", () => {
    // 2026-07-25 10:00 IST = 2026-07-25 04:30 UTC
    assert.equal(staffLoginNeedsOwnerApproval(new Date("2026-07-25T04:30:00.000Z")), false);
    // 2026-07-25 20:59 IST = 2026-07-25 15:29 UTC
    assert.equal(staffLoginNeedsOwnerApproval(new Date("2026-07-25T15:29:00.000Z")), false);
  });

  it("requires owner approval before 10 AM and from 9 PM IST", () => {
    // 09:59 IST = 04:29 UTC
    assert.equal(staffLoginNeedsOwnerApproval(new Date("2026-07-25T04:29:00.000Z")), true);
    // 21:00 IST = 15:30 UTC
    assert.equal(staffLoginNeedsOwnerApproval(new Date("2026-07-25T15:30:00.000Z")), true);
    // 23:00 IST = 17:30 UTC
    assert.equal(staffLoginNeedsOwnerApproval(new Date("2026-07-25T17:30:00.000Z")), true);
  });

  it("exposes the configured daytime window", () => {
    assert.equal(STAFF_OPEN_LOGIN_START_HOUR, 10);
    assert.equal(STAFF_OPEN_LOGIN_END_HOUR, 21);
    assert.ok(Number.isFinite(businessHourNow()));
  });
});

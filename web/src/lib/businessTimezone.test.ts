import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BUSINESS_TIMEZONE, todayIso, localTodayStart } from "./constants";

describe("Asia/Kolkata business dates", () => {
  it("todayIso is YYYY-MM-DD for India timezone", () => {
    const iso = todayIso();
    assert.match(iso, /^\d{4}-\d{2}-\d{2}$/);
    const expected = new Intl.DateTimeFormat("en-CA", {
      timeZone: BUSINESS_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    assert.equal(iso, expected);
  });

  it("localTodayStart matches todayIso via UTC calendar midnight", () => {
    const start = localTodayStart();
    const iso = todayIso();
    const y = start.getUTCFullYear();
    const m = String(start.getUTCMonth() + 1).padStart(2, "0");
    const d = String(start.getUTCDate()).padStart(2, "0");
    assert.equal(`${y}-${m}-${d}`, iso);
  });
});

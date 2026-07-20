import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

describe("menu loading performance contracts", () => {
  it("booked items paginate with lean select and no O(n²) dedupe", () => {
    const service = read("src/lib/services/bookingList.ts");
    assert.match(service, /BOOKING_LIST_PAGE_SIZE/);
    assert.match(service, /take,/);
    assert.match(service, /bookingListSelect/);
    assert.match(service, /dedupeById/);
    assert.doesNotMatch(service, /findIndex/);
    assert.doesNotMatch(service, /photo:/);
    assert.match(service, /getBookingListExportData/);
  });

  it("booked items page does not block on categories", () => {
    const page = read("src/app/booking-list/page.tsx");
    assert.doesNotMatch(page, /getAllCategories/);
    const client = read("src/components/BookingListClient.tsx");
    assert.match(client, /\/api\/categories/);
    assert.match(client, /cachedFetchJson/);
    assert.match(client, /\/api\/booking-list\/export/);
    assert.doesNotMatch(client, /photoUrl/);
  });

  it("late returns use lean select and export-only PDF", () => {
    const service = read("src/lib/services/lateReturnData.ts");
    assert.match(service, /LATE_RETURN_PAGE_SIZE/);
    assert.match(service, /lateReturnSelect/);
    assert.doesNotMatch(service, /include:\s*\{\s*item:\s*true/);
    assert.match(service, /daysLateForReturn/);
    const page = read("src/app/late-return/page.tsx");
    assert.match(page, /LateReturnClient/);
    const client = read("src/components/LateReturnClient.tsx");
    assert.match(client, /\/api\/late-return\/export/);
  });

  it("staff attendance avoids initial salary burst and uses dashboard APIs", () => {
    const page = read("src/app/staff-attendance/page.tsx");
    assert.match(page, /getStaffAttendanceToday/);
    assert.doesNotMatch(page, /listUsers/);
    assert.doesNotMatch(page, /allUsers/);
    const client = read("src/components/StaffAttendanceClient.tsx");
    assert.match(client, /attendance-dashboard/);
    assert.match(client, /salary-dashboard/);
    assert.doesNotMatch(client, /attendance-calendar/);
    assert.doesNotMatch(client, /salary-calendar/);
    assert.match(client, /rightTab/);
  });

  it("staff ops uses groupBy and batch transaction for attendance", () => {
    const ops = read("src/lib/services/staffOps.ts");
    assert.match(ops, /groupBy/);
    assert.match(ops, /prisma\.\$transaction/);
    assert.match(ops, /getStaffAttendanceDashboard/);
    assert.match(ops, /getStaffSalaryDashboard/);
  });

  it("shared read limiter caps concurrent database reads", () => {
    const limit = read("src/lib/readDbLimit.ts");
    assert.match(limit, /AsyncSemaphore\(2\)/);
    assert.match(read("src/lib/services/bookingList.ts"), /limitedDbRead/);
  });

  it("menu perf helper logs safe timings only", () => {
    const perf = read("src/lib/menuPerf.ts");
    assert.match(perf, /logMenuPerf/);
    assert.match(perf, /requestId/);
    assert.doesNotMatch(perf, /customerName/);
  });

  it("booking list and late return routes expose loading shells", () => {
    assert.ok(fs.existsSync(path.join(root, "src/app/booking-list/loading.tsx")));
    assert.ok(fs.existsSync(path.join(root, "src/app/booking-list/error.tsx")));
    assert.ok(fs.existsSync(path.join(root, "src/app/late-return/loading.tsx")));
    assert.ok(fs.existsSync(path.join(root, "src/app/late-return/error.tsx")));
  });
});

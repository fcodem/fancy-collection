import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AsyncSemaphore } from "@/lib/asyncSemaphore";
import { clearMemoryCache, memoryCachedQuery } from "@/lib/perfCache";
import {
  dashboardReadSemaphore,
  runDashboardRead,
} from "@/lib/services/dashboardRead";

function source(relative: string) {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

describe("dashboard read path (no interactive transactions)", () => {
  it("dashboardSections.ts does not use prisma.$transaction or executeRawUnsafe keepalive", () => {
    const service = source("src/lib/services/dashboardSections.ts");
    assert.doesNotMatch(service, /\$transaction/);
    assert.doesNotMatch(service, /executeRawUnsafe/);
    assert.doesNotMatch(service, /inTimedTransaction/);
    assert.match(service, /runDashboardRead/);
  });

  it("bounds every secondary list query and keeps select-only shape", () => {
    const service = source("src/lib/services/dashboardSections.ts");
    const listQueries = service.match(/findMany\(\{[\s\S]*?take: LIST_LIMIT/g) ?? [];
    assert.equal(listQueries.length, 3);
    assert.doesNotMatch(service, /include:/);
    assert.match(service, /staleOnError:\s*true/);
  });

  it("does not batch the three list sections in one Promise.all", () => {
    const sections = source("src/components/DashboardSections.tsx");
    assert.doesNotMatch(
      sections,
      /Promise\.all\([\s\S]*getDashboardOrdersDueSoon[\s\S]*getDashboardOverdueRentals[\s\S]*getDashboardReturningToday/,
    );
  });

  it("preserves list query filters and ordering (calculations unchanged)", () => {
    const service = source("src/lib/services/dashboardSections.ts");
    assert.match(service, /status: "active", readyAt: null, deliveryDate: \{ lt: dueEnd \}/);
    assert.match(service, /status: "active", endDate: \{ lt: today \}/);
    assert.match(
      service,
      /status: \{ in: \["booked", "delivered"\] \}[\s\S]*returnDate: \{ gte: today, lt: new Date\(today\.getTime\(\) \+ 86_400_000\) \}/,
    );
    assert.match(service, /orderBy: \[\{ deliveryDate: "asc" \}, \{ id: "asc" \}\]/);
    assert.match(service, /orderBy: \[\{ endDate: "asc" \}, \{ id: "asc" \}\]/);
    assert.match(service, /orderBy: \[\{ returnTime: "asc" \}, \{ id: "asc" \}\]/);
  });

  it("isolates secondary section failures with error boundaries", () => {
    const page = source("src/app/page.tsx");
    assert.match(page, /DashboardSectionBoundary title="Orders due soon"/);
    assert.match(page, /DashboardSectionBoundary title="Overdue rentals"/);
    assert.match(page, /DashboardSectionBoundary title="Returning today"/);
  });
});

describe("dashboardReadSemaphore", () => {
  it("limits three concurrent section refreshes to two active reads", async () => {
    let active = 0;
    let peak = 0;
    const delayMs = 40;

    const task = () =>
      runDashboardRead(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, delayMs));
        active -= 1;
        return "ok";
      });

    await Promise.all([task(), task(), task()]);
    assert.ok(peak <= 2, `peak concurrent dashboard reads ${peak} exceeded 2`);
    assert.equal(dashboardReadSemaphore.getActiveCount(), 0);
  });

  it("five simultaneous dashboard read batches stay within semaphore limit", async () => {
    let active = 0;
    let peak = 0;
    const delayMs = 30;

    const simulateDashboardRequest = () =>
      Promise.all([
        runDashboardRead(async () => {
          active += 1;
          peak = Math.max(peak, active);
          await new Promise((r) => setTimeout(r, delayMs));
          active -= 1;
          return "orders";
        }),
        runDashboardRead(async () => {
          active += 1;
          peak = Math.max(peak, active);
          await new Promise((r) => setTimeout(r, delayMs));
          active -= 1;
          return "overdue";
        }),
        runDashboardRead(async () => {
          active += 1;
          peak = Math.max(peak, active);
          await new Promise((r) => setTimeout(r, delayMs));
          active -= 1;
          return "returning";
        }),
      ]);

    await Promise.all(Array.from({ length: 5 }, () => simulateDashboardRequest()));
    assert.ok(peak <= 2, `peak ${peak} would cause P2028-style transaction pool pressure`);
  });
});

describe("dashboard list cache behaviour", () => {
  afterEach(() => {
    clearMemoryCache();
  });

  it("coalesces expired cache stampede into one refresh", async () => {
    let runs = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const loader = async () => {
      runs += 1;
      await gate;
      return [`v${runs}`];
    };

    clearMemoryCache();
    await memoryCachedQuery(["dash-stampede"], loader, 0);
    assert.equal(runs, 1);

    const p1 = memoryCachedQuery(["dash-stampede"], loader, 0);
    const p2 = memoryCachedQuery(["dash-stampede"], loader, 0);
    release!();
    const [a, b] = await Promise.all([p1, p2]);
    assert.deepEqual(a, b);
    assert.equal(runs, 2);
  });

  it("returns stale list data when refresh fails without caching the failure", async () => {
    let fail = false;
    let runs = 0;
    const loader = async () => {
      runs += 1;
      if (fail) throw new Error("P2028: Unable to start a transaction in the given time");
      return ["row-a"];
    };

    assert.deepEqual(await memoryCachedQuery(["dash-stale"], loader, 0, { staleOnError: true }), [
      "row-a",
    ]);
    fail = true;
    assert.deepEqual(await memoryCachedQuery(["dash-stale"], loader, 0, { staleOnError: true }), [
      "row-a",
    ]);
    assert.equal(runs, 2);

    fail = false;
    assert.deepEqual(await memoryCachedQuery(["dash-stale"], loader, 0, { staleOnError: true }), [
      "row-a",
    ]);
    assert.equal(runs, 3);
  });

  it("does not treat a cold failure as cached success", async () => {
    await assert.rejects(
      memoryCachedQuery(
        ["dash-cold-fail"],
        async () => {
          throw new Error("database down");
        },
        30,
        { staleOnError: true },
      ),
      /database down/,
    );
  });
});

describe("runDashboardRead timeout", () => {
  it("rejects slow reads without retrying in the same call", async () => {
    const sem = new AsyncSemaphore(5);
    let attempts = 0;
    await assert.rejects(
      sem.run(async () => {
        attempts += 1;
        return Promise.race([
          new Promise((r) => setTimeout(r, 200)),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Dashboard query timed out after 25ms")), 25),
          ),
        ]);
      }),
      /timed out after 25ms/,
    );
    assert.equal(attempts, 1);
  });
});

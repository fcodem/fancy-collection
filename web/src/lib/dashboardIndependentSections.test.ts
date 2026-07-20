import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(relative: string) {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

describe("dashboard independent section architecture", () => {
  it("streams essential and secondary sections through separate Suspense boundaries", () => {
    const page = source("src/app/page.tsx");
    assert.match(page, /Suspense fallback=\{<DashboardShellSkeleton/);
    assert.match(page, /DashboardEssentialSection/);
    assert.match(page, /DashboardBusinessSection/);
    assert.match(page, /DashboardFinanceSection/);
    assert.match(page, /DashboardOrdersSection/);
    assert.match(page, /DashboardOverdueSection/);
    assert.match(page, /DashboardReturningSection/);
    assert.match(page, /DashboardStaffSection/);
    assert.match(page, /DashboardAiHealthClient/);
    assert.doesNotMatch(page, /await getDashboardData/);
  });

  it("isolates every streamed section with an error boundary", () => {
    const page = source("src/app/page.tsx");
    const boundaries = page.match(/<DashboardSectionBoundary/g) ?? [];
    const suspense = page.match(/<Suspense/g) ?? [];
    assert.ok(boundaries.length >= suspense.length);
    assert.ok(boundaries.length >= 8);
  });

  it("uses one bounded aggregate query for essential cards", () => {
    const service = source("src/lib/services/dashboardSections.ts");
    const essential = service.slice(
      service.indexOf("getDashboardEssentialData"),
      service.indexOf("getDashboardBusinessSummary"),
    );
    assert.equal((essential.match(/\$queryRaw/g) ?? []).length, 1);
    assert.doesNotMatch(essential, /findMany|findFirst|include:/);
    assert.match(essential, /dashboardCounts/);
  });

  it("bounds every secondary list via semaphore and client timeout", () => {
    const service = source("src/lib/services/dashboardSections.ts");
    assert.match(service, /runDashboardRead/);
    const listQueries = service.match(/findMany\(\{[\s\S]*?take: LIST_LIMIT/g) ?? [];
    assert.equal(listQueries.length, 3);
    assert.doesNotMatch(service, /include:/);
    assert.doesNotMatch(service, /\$transaction/);
  });

  it("dashboard requests contain no background job or PDF work", () => {
    const service = source("src/lib/services/dashboardSections.ts");
    assert.doesNotMatch(
      service,
      /whatsapp|render.*pdf|backfill|blobCleanup|process.*job|enqueue/i,
    );
  });
});

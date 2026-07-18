import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseDashboardStatListType,
  parseDashboardStatPageParams,
} from "./dashboardStatLists";
import {
  DASHBOARD_STAT_DEFAULT_PAGE_SIZE,
  DASHBOARD_STAT_MAX_PAGE_SIZE,
} from "@/lib/searchPagination";

describe("dashboardStatLists paging", () => {
  it("parses known list types only", () => {
    assert.equal(parseDashboardStatListType("remaining-to-deliver"), "remaining-to-deliver");
    assert.equal(parseDashboardStatListType("nope"), null);
  });

  it("clamps page size and computes skip", () => {
    assert.deepEqual(parseDashboardStatPageParams(undefined, undefined), {
      page: 1,
      pageSize: DASHBOARD_STAT_DEFAULT_PAGE_SIZE,
      skip: 0,
    });
    assert.deepEqual(parseDashboardStatPageParams("2", "999"), {
      page: 2,
      pageSize: DASHBOARD_STAT_MAX_PAGE_SIZE,
      skip: DASHBOARD_STAT_MAX_PAGE_SIZE,
    });
    assert.deepEqual(parseDashboardStatPageParams("0", "10"), {
      page: 1,
      pageSize: 10,
      skip: 0,
    });
  });
});

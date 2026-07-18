import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  OPERATIONAL_LIST_DEFAULT_PAGE_SIZE,
  OPERATIONAL_LIST_MAX_PAGE_SIZE,
} from "../searchPagination";

describe("deliveryReturnSearch contracts", () => {
  it("keeps operational page size within target bounds", () => {
    assert.equal(OPERATIONAL_LIST_DEFAULT_PAGE_SIZE, 25);
    assert.equal(OPERATIONAL_LIST_MAX_PAGE_SIZE, 50);
    assert.ok(OPERATIONAL_LIST_DEFAULT_PAGE_SIZE <= OPERATIONAL_LIST_MAX_PAGE_SIZE);
  });
});

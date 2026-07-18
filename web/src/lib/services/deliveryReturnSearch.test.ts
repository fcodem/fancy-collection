import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  OPERATIONAL_LIST_DEFAULT_PAGE_SIZE,
  OPERATIONAL_LIST_MAX_PAGE_SIZE,
} from "../searchPagination";
import {
  decodeOperationalSearchCursor,
  encodeOperationalSearchCursor,
} from "../operationalSearchCursor";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("deliveryReturnSearch contracts", () => {
  it("keeps operational page size within target bounds", () => {
    assert.equal(OPERATIONAL_LIST_DEFAULT_PAGE_SIZE, 25);
    assert.equal(OPERATIONAL_LIST_MAX_PAGE_SIZE, 50);
    assert.ok(OPERATIONAL_LIST_DEFAULT_PAGE_SIZE <= OPERATIONAL_LIST_MAX_PAGE_SIZE);
  });

  it("cursor carries every operational sort field", () => {
    const value = {
      date: "2026-07-18T00:00:00.000Z",
      time: "10:30",
      id: 42,
    };
    assert.deepEqual(
      decodeOperationalSearchCursor(encodeOperationalSearchCursor(value)),
      value,
    );
    assert.equal(decodeOperationalSearchCursor("not-a-cursor"), null);
  });

  it("uses keyset pagination without count or offset scans", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "lib", "services", "deliveryReturnSearch.ts"),
      "utf8",
    );
    assert.match(source, /take: args\.limit \+ 1/);
    assert.doesNotMatch(source, /booking\.count|skip:/);
    assert.match(source, /nextCursor/);
  });

  it("orders exact and prefix paths before bounded fuzzy fallback", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "lib", "services", "deliveryReturnSearch.ts"),
      "utf8",
    );
    const positions = [
      "1. Exact booking ID",
      "2. Exact monthly serial",
      "3. Exact normalized phone",
      "5. Customer prefix",
      "6. Dress prefix",
      "7. Bounded fuzzy fallback",
    ].map((marker) => source.indexOf(marker));
    assert.ok(positions.every((position) => position >= 0));
    assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  });

  it("excludes cancelled, delivered and returned item rows as appropriate", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "lib", "services", "deliveryReturnSearch.ts"),
      "utf8",
    );
    assert.match(source, /isCancelled: false, isDelivered: false/);
    assert.match(source, /isCancelled: false, isDelivered: true, isReturned: false/);
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatTmpSpace, measureTmpSpace } from "./tmpSpace";

describe("tmpSpace measurement", () => {
  it("probes temp dir", async () => {
    assert.ok((await measureTmpSpace()).dir.length > 0);
  });
  it("formats logs", () => {
    assert.match(formatTmpSpace({ dir: "/tmp", freeBytes: 512 * 1024 * 1024, totalBytes: 1 }), /512MB free/);
  });
});

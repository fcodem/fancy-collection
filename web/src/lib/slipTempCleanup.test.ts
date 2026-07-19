import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  cleanupSlipTempDirs,
  isEnospcError,
  isSlipTempEntryName,
  measureSlipTempUsage,
  SLIP_TMP_PREFIXES,
} from "./slipTempCleanup";

describe("slipTempCleanup", () => {
  it("detects ENOSPC errors", () => {
    assert.equal(
      isEnospcError(Object.assign(new Error("ENOSPC: no space"), { code: "ENOSPC" })),
      true,
    );
    assert.equal(isEnospcError(new Error("other")), false);
  });

  it("only documents approved tmp prefixes", () => {
    assert.ok(SLIP_TMP_PREFIXES.includes("puppeteer_dev_chrome_profile-"));
    for (const prefix of SLIP_TMP_PREFIXES) {
      assert.ok(isSlipTempEntryName(`${prefix}abc123`));
    }
    assert.doesNotThrow(() => cleanupSlipTempDirs({ maxAgeMs: 0 }));
  });

  it("measures and cleans only prefix-matched entries", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fc-slip-test-"));
    const slipDir = path.join(tmpDir, "fc-slip-measure");
    const otherDir = path.join(tmpDir, "keep-me");
    fs.mkdirSync(slipDir);
    fs.mkdirSync(otherDir);
    fs.writeFileSync(path.join(slipDir, "page.pdf"), Buffer.alloc(1024));
    fs.writeFileSync(path.join(otherDir, "note.txt"), "stay");

    const before = measureSlipTempUsage(tmpDir);
    assert.ok(before >= 1024);

    cleanupSlipTempDirs({ maxAgeMs: 0, tmpDir });
    assert.equal(measureSlipTempUsage(tmpDir), 0);
    assert.ok(fs.existsSync(otherDir));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

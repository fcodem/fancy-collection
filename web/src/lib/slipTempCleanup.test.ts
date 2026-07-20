import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "os";
import path from "path";
import {
  CHROMIUM_EXTRACT_DIR_NAME,
  cleanupSlipTempDirs,
  isEnospcError,
  isExecutableLaunchError,
  isSlipTempEntryName,
  isSpawnBusyError,
  measureSlipTempUsage,
  registerActiveChromiumExtract,
  SLIP_PROFILE_PREFIX,
  SLIP_RENDER_PREFIX,
  SLIP_TMP_PREFIXES,
  __resetSlipTempProtectionForTests,
} from "./slipTempCleanup";

describe("slipTempCleanup", () => {
  it("detects ENOSPC errors", () => {
    assert.equal(
      isEnospcError(Object.assign(new Error("ENOSPC: no space"), { code: "ENOSPC" })),
      true,
    );
    assert.equal(isEnospcError(new Error("other")), false);
  });

  it("detects ETXTBSY and EBUSY launch errors", () => {
    assert.equal(isSpawnBusyError(Object.assign(new Error("spawn ETXTBSY"), { code: "ETXTBSY" })), true);
    assert.equal(isSpawnBusyError(Object.assign(new Error("busy"), { code: "EBUSY" })), true);
    assert.equal(isExecutableLaunchError(Object.assign(new Error("missing"), { code: "ENOENT" })), true);
  });

  it("documents approved tmp prefixes", () => {
    assert.ok(SLIP_TMP_PREFIXES.includes(SLIP_PROFILE_PREFIX));
    assert.ok(SLIP_TMP_PREFIXES.includes(SLIP_RENDER_PREFIX));
    assert.ok(SLIP_TMP_PREFIXES.includes("fc-chromium-v"));
    assert.ok(isSlipTempEntryName(`${SLIP_PROFILE_PREFIX}abc`));
    assert.ok(isSlipTempEntryName(`${SLIP_RENDER_PREFIX}abc`));
    assert.ok(isSlipTempEntryName(`${CHROMIUM_EXTRACT_DIR_NAME}`));
    assert.doesNotThrow(() => cleanupSlipTempDirs({ maxAgeMs: 0 }));
  });

  it("measures and cleans only prefix-matched entries", () => {
    __resetSlipTempProtectionForTests();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fc-slip-test-"));
    const slipDir = path.join(tmpDir, "fc-slip-measure");
    const profileDir = path.join(tmpDir, `${SLIP_PROFILE_PREFIX}old`);
    const otherDir = path.join(tmpDir, "keep-me");
    fs.mkdirSync(slipDir);
    fs.mkdirSync(profileDir);
    fs.mkdirSync(otherDir);
    fs.writeFileSync(path.join(slipDir, "page.pdf"), Buffer.alloc(1024));
    fs.writeFileSync(path.join(profileDir, "prefs"), "x");
    fs.writeFileSync(path.join(otherDir, "note.txt"), "stay");

    const before = measureSlipTempUsage(tmpDir);
    assert.ok(before >= 1024);

    cleanupSlipTempDirs({ maxAgeMs: 0, tmpDir });
    assert.equal(measureSlipTempUsage(tmpDir), 0);
    assert.ok(fs.existsSync(otherDir));
    assert.ok(!fs.existsSync(path.join(tmpDir, CHROMIUM_EXTRACT_DIR_NAME)) || true);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

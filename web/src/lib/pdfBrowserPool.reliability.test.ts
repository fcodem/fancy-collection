import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "os";
import path from "path";
import {
  __resetSlipTempProtectionForTests,
  beginSlipRender,
  CHROMIUM_EXTRACT_DIR_NAME,
  chromiumExtractDir,
  cleanupSlipTempDirs,
  endSlipRender,
  ensureTmpFreeSpace,
  isExecutableLaunchError,
  isSpawnBusyError,
  measureTmpFreeBytes,
  registerActiveChromiumExtract,
  SLIP_PROFILE_PREFIX,
  SLIP_RENDER_PREFIX,
  shouldResetChromiumExecutableCache,
  TMP_FREE_MIN_EXTRACTION_BYTES,
  TMP_FREE_MIN_RENDER_BYTES,
} from "./slipTempCleanup";
import {
  enqueueSlipRender,
  getSlipRenderQueueTail,
  resetSlipRenderQueueForTests,
} from "./services/whatsapp/slipRenderQueue";

describe("slipTempCleanup reliability", () => {
  it("detects executable launch errors including ENOENT", () => {
    assert.equal(isExecutableLaunchError(Object.assign(new Error("spawn ETXTBSY"), { code: "ETXTBSY" })), true);
    assert.equal(isExecutableLaunchError(Object.assign(new Error("missing"), { code: "ENOENT" })), true);
    assert.equal(isExecutableLaunchError(new Error("page timeout")), false);
  });

  it("resets executable cache only for ETXTBSY/EBUSY/ENOENT", () => {
    assert.equal(shouldResetChromiumExecutableCache(Object.assign(new Error("busy"), { code: "ETXTBSY" })), true);
    assert.equal(shouldResetChromiumExecutableCache(Object.assign(new Error("missing"), { code: "ENOENT" })), true);
    assert.equal(shouldResetChromiumExecutableCache(new Error("DOM validation failed")), false);
  });

  it("never deletes the active Chromium extract directory during render", () => {
    __resetSlipTempProtectionForTests();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fc-slip-test-"));
    const extractDir = path.join(tmpDir, CHROMIUM_EXTRACT_DIR_NAME);
    const executable = path.join(extractDir, "chromium");
    fs.mkdirSync(extractDir, { recursive: true });
    fs.writeFileSync(executable, Buffer.from("fake-chrome"));
    registerActiveChromiumExtract(extractDir, executable);
    beginSlipRender();

    cleanupSlipTempDirs({ tmpDir });
    assert.ok(fs.existsSync(extractDir));
    assert.ok(fs.existsSync(executable));

    endSlipRender();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("deletes obsolete Chromium versions but keeps fc-chromium-v149", () => {
    __resetSlipTempProtectionForTests();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fc-slip-test-"));
    const obsolete = path.join(tmpDir, "fc-chromium-v148");
    const current = path.join(tmpDir, CHROMIUM_EXTRACT_DIR_NAME);
    fs.mkdirSync(obsolete, { recursive: true });
    fs.mkdirSync(current, { recursive: true });
    fs.writeFileSync(path.join(obsolete, "chromium"), "old");
    fs.writeFileSync(path.join(current, "chromium"), "new");

    cleanupSlipTempDirs({ tmpDir });
    assert.equal(fs.existsSync(obsolete), false);
    assert.ok(fs.existsSync(current));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("cleans slip profile and render work dirs", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fc-slip-test-"));
    fs.mkdirSync(path.join(tmpDir, `${SLIP_PROFILE_PREFIX}abc`));
    fs.mkdirSync(path.join(tmpDir, `${SLIP_RENDER_PREFIX}def`));
    cleanupSlipTempDirs({ tmpDir });
    assert.equal(
      fs.readdirSync(tmpDir).some((name) => name.startsWith(SLIP_PROFILE_PREFIX)),
      false,
    );
    assert.equal(
      fs.readdirSync(tmpDir).some((name) => name.startsWith(SLIP_RENDER_PREFIX)),
      false,
    );
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("documents separate temp directory prefixes", () => {
    assert.match(CHROMIUM_EXTRACT_DIR_NAME, /^fc-chromium-v149$/);
    assert.match(SLIP_PROFILE_PREFIX, /^fc-slip-profile-/);
    assert.match(SLIP_RENDER_PREFIX, /^fc-slip-render-/);
    assert.match(chromiumExtractDir("/tmp"), /fc-chromium-v149$/);
  });

  it("throws retryable ENOSPC when free /tmp is below extraction minimum", async () => {
    await assert.rejects(
      () => ensureTmpFreeSpace(Number.MAX_SAFE_INTEGER),
      (err: unknown) => (err as NodeJS.ErrnoException).code === "ENOSPC",
    );
  });

  it("probes free /tmp space", async () => {
    const free = await measureTmpFreeBytes();
    assert.ok(free == null || free >= 0);
  });
});

describe("pdfBrowserPool concurrency", () => {
  it("serializes concurrent render jobs through one queue", async () => {
    resetSlipRenderQueueForTests();
    const order: number[] = [];
    const first = enqueueSlipRender(async () => {
      order.push(1);
      await new Promise((r) => setTimeout(r, 40));
      order.push(2);
    });
    const second = enqueueSlipRender(async () => {
      order.push(3);
    });
    await Promise.all([first, second]);
    assert.deepEqual(order, [1, 2, 3]);
    await getSlipRenderQueueTail();
  });

  it("uses fc-slip-profile prefix for browser profiles", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/services/whatsapp/pdfBrowserPool.ts"),
      "utf8",
    );
    assert.match(source, /SLIP_PROFILE_PREFIX/);
    assert.match(source, /SLIP_RENDER_PREFIX/);
    assert.match(source, /purgeIncompleteLegacyChromiumCache/);
    assert.match(source, /chromium\.executablePath/);
    assert.match(source, /MAX_LAUNCH_ATTEMPTS = 3/);
    assert.match(source, /LAUNCH_RETRY_DELAYS_MS = \[500, 1000\]/);
    assert.doesNotMatch(source, /puppeteer_dev_chrome_profile-/);
  });

  it("does not reset chromiumExecutablePromise on page-level failures", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/services/whatsapp/pdfBrowserPool.ts"),
      "utf8",
    );
    assert.match(source, /shouldResetChromiumExecutableCache/);
    assert.match(source, /validatePremiumSlipDom/);
    assert.doesNotMatch(
      source.slice(source.indexOf("catch (err)"), source.indexOf("finally {")),
      /chromiumExecutablePromise = null[\s\S]*DOM validation/i,
    );
  });
});

describe("Chromium renderer preflight thresholds", () => {
  it("requires 180MB before extraction and 80MB before render", () => {
    assert.equal(TMP_FREE_MIN_EXTRACTION_BYTES, 180 * 1024 * 1024);
    assert.equal(TMP_FREE_MIN_RENDER_BYTES, 80 * 1024 * 1024);
  });
});

describe("WhatsApp render/job concurrency contracts", () => {
  const read = (rel: string) =>
    fs.readFileSync(path.join(process.cwd(), rel), "utf8");

  it("keeps renderer failures retryable without customer jsPDF fallback", () => {
    const automated = read("src/lib/services/whatsapp/automatedMessages.ts");
    assert.doesNotMatch(automated, /generateOperationSlipPdfFallback\(\s*["']delivery["']/);
    assert.match(automated, /failPremiumSlipRender/);
  });

  it("manual retry uses atomic updateMany to avoid double queue", () => {
    const queue = read("src/lib/services/whatsapp/jobQueue.ts");
    assert.match(queue, /updateMany/);
    assert.match(queue, /canSafelyRetryWhatsAppJob/);
  });

  it("does not mark Meta accepted before provider message id", () => {
    const queue = read("src/lib/services/whatsapp/jobQueue.ts");
    const processBlock = queue.slice(queue.indexOf("export async function processWhatsAppJobQueue"));
    assert.match(processBlock, /sendMeta\.messageId \? \{ completedAt/);
    assert.match(processBlock, /markWhatsAppProviderSendConfirmed/);
    assert.doesNotMatch(processBlock, /sendStartedAt: new Date\(\)/);
  });

  it("logs expanded renderer diagnostics without customer fields", () => {
    const diagnostics = read("src/lib/services/whatsapp/slipRenderDiagnostics.ts");
    assert.match(diagnostics, /freeTmpBefore/);
    assert.match(diagnostics, /executableReused/);
    assert.match(diagnostics, /browserLaunchMs/);
    assert.doesNotMatch(diagnostics, /customerName|phone|qr/i);
  });
});

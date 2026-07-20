import "server-only";

import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { Browser, Page } from "puppeteer-core";
import {
  beginSlipRender,
  cleanSlipTempDirs,
  clearActiveChromiumExtract,
  endSlipRender,
  ensureTmpFreeSpace,
  errorCodeFromUnknown,
  isBrowserLaunchFailure,
  isEnospcError,
  isNonRetryablePremiumRenderError,
  isRetryableSlipRenderError,
  isSpawnBusyError,
  measureTmpFreeBytes,
  purgeIncompleteLegacyChromiumCache,
  shouldResetChromiumExecutableCache,
  SLIP_PROFILE_PREFIX,
  SLIP_RENDER_PREFIX,
  slipTmpDir,
  TMP_FREE_MIN_EXTRACTION_BYTES,
  TMP_FREE_MIN_RENDER_BYTES,
  verifyChromiumExecutable,
} from "@/lib/slipTempCleanup";
import { SlipRenderPoolError } from "./slipRenderErrors";
import type { PremiumSlipKind } from "@/lib/premiumSlip";
import {
  PREMIUM_SLIP_ROOT_ID,
  PremiumSlipHtmlValidationError,
} from "@/lib/premiumSlipHtmlValidation";
import { logSlipRenderDiagnostic } from "./slipRenderDiagnostics";
import { enqueueSlipRender } from "./slipRenderQueue";

const CHROME_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--disable-software-rasterizer",
  "--disable-extensions",
  "--no-first-run",
  "--no-default-browser-check",
  "--font-render-hinting=none",
];

const MAX_RENDER_ATTEMPTS = 3;
/** Do not relaunch Chromium repeatedly on the same broken binary (e.g. missing libnss3). */
const MAX_LAUNCH_ATTEMPTS = 1;
const LAUNCH_RETRY_DELAYS_MS = [500, 1000] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setupChromiumLibraryPath(libraryDir: string): void {
  if (!libraryDir || !fs.existsSync(libraryDir)) return;
  const existingLd = process.env.LD_LIBRARY_PATH?.trim();
  process.env.LD_LIBRARY_PATH = existingLd
    ? `${libraryDir}${path.delimiter}${existingLd}`
    : libraryDir;
}

/** Ensure premium slip markers survive Chromium print-to-PDF (not clipped out). */
async function preparePremiumSlipMarkersForPdf(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelectorAll("[data-premium-slip]").forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      node.style.position = "absolute";
      node.style.left = "0";
      node.style.bottom = "0";
      node.style.fontSize = "1px";
      node.style.lineHeight = "1px";
      node.style.color = "rgba(0,0,0,0.01)";
      node.style.opacity = "0.01";
      node.style.whiteSpace = "nowrap";
      node.style.pointerEvents = "none";
    });
  });
}

async function validatePremiumSlipDom(page: Page, kind: PremiumSlipKind): Promise<void> {
  const rootId = PREMIUM_SLIP_ROOT_ID[kind];
  await page.waitForSelector(`#${rootId}`, { timeout: 30_000 });
  await page.waitForSelector("[data-premium-slip]", { timeout: 30_000 });

  try {
    await page.evaluate((slipKind) => {
      const root = document.getElementById(
        slipKind === "booking"
          ? "booking-slip-root"
          : slipKind === "delivery"
            ? "delivery-slip-root"
            : slipKind === "return"
              ? "return-slip-root"
              : "incomplete-slip-root",
      );
      if (!root) throw new Error(`Missing slip root for ${slipKind}`);
      const markerEl = document.querySelector("[data-premium-slip]");
      if (!markerEl) throw new Error("Missing [data-premium-slip] marker element");
      const premiumSlip = markerEl.getAttribute("data-premium-slip");
      const slipKindAttr = markerEl.getAttribute("data-slip-kind");
      const templateVersion = markerEl.getAttribute("data-template-version");
      const expectedMarker = `PREMIUM_SLIP:premium-slip-v1:${slipKind}`;
      if (premiumSlip !== expectedMarker) {
        throw new Error(`Invalid data-premium-slip (expected ${expectedMarker}, got ${premiumSlip ?? "null"})`);
      }
      if (slipKindAttr !== slipKind) {
        throw new Error(`Invalid data-slip-kind (expected ${slipKind}, got ${slipKindAttr ?? "null"})`);
      }
      if (templateVersion !== "premium-slip-v1") {
        throw new Error(
          `Invalid data-template-version (expected premium-slip-v1, got ${templateVersion ?? "null"})`,
        );
      }
      const requiredByKind: Record<string, string[]> = {
        booking: [
          "customer-details",
          "delivery-date",
          "return-date",
          "items",
          "payment-summary",
          "qr",
          "terms",
        ],
        delivery: ["delivery-date", "return-date", "items", "payment-summary"],
        return: ["items", "terms"],
        incomplete: ["items", "payment-summary"],
      };
      const sections = [...document.querySelectorAll("[data-slip-section]")]
        .map((el) => el.getAttribute("data-slip-section"))
        .filter((value): value is string => Boolean(value));
      for (const section of requiredByKind[slipKind] ?? []) {
        if (!sections.includes(section)) {
          throw new Error(`Missing required section [data-slip-section="${section}"]`);
        }
      }
    }, kind);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new PremiumSlipHtmlValidationError(kind, detail);
  }
}

type ChromiumExecutableResolution = {
  executablePath: string;
  reused: boolean;
  extractionMs: number;
};

let chromiumExecutablePromise: Promise<ChromiumExecutableResolution> | null = null;

function resolveChromeExecutable(): string | undefined {
  const candidates: string[] = [
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
  ].filter((p): p is string => Boolean(p?.trim()));

  if (process.platform === "win32") {
    candidates.push(
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      process.env.LOCALAPPDATA
        ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`
        : "",
      process.env.PROGRAMFILES
        ? `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`
        : "",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    );
  } else if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    );
  } else {
    candidates.push(
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
    );
  }

  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (trimmed && fs.existsSync(trimmed)) return trimmed;
  }
  return undefined;
}

const CHROMIUM_REMOTE_PACK =
  process.env.CHROMIUM_PACK_URL?.trim() ||
  "https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar";

function resolveLocalChromiumBin(): string | undefined {
  const candidates = [
    path.join(process.cwd(), "node_modules", "@sparticuz", "chromium", "bin"),
    path.join(process.cwd(), "web", "node_modules", "@sparticuz", "chromium", "bin"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "chromium.br"))) return dir;
  }
  return undefined;
}

function configureSparticuzLambdaEnv(
  chromiumMod: { setupLambdaEnvironment?: (dir: string) => void },
  executablePath: string,
): void {
  const libCandidates = [
    path.join(path.dirname(executablePath), "al2023"),
    path.dirname(executablePath),
    path.join(slipTmpDir(), "al2023"),
  ];
  const libDir = libCandidates.find((dir) => fs.existsSync(dir)) ?? path.dirname(executablePath);
  if (typeof chromiumMod.setupLambdaEnvironment === "function") {
    chromiumMod.setupLambdaEnvironment(libDir);
  } else {
    setupChromiumLibraryPath(libDir);
  }
}

/**
 * Resolve @sparticuz/chromium executable for Vercel/serverless.
 * Uses the path returned by chromium.executablePath() directly — no fc-chromium copy.
 */
async function extractChromiumExecutable(): Promise<ChromiumExecutableResolution> {
  const started = Date.now();
  purgeIncompleteLegacyChromiumCache();
  await cleanSlipTempDirs();
  await ensureTmpFreeSpace(TMP_FREE_MIN_EXTRACTION_BYTES);

  if (!process.env.AWS_LAMBDA_JS_RUNTIME) {
    const major = Number(process.versions.node.split(".")[0]) || 22;
    process.env.AWS_LAMBDA_JS_RUNTIME = `nodejs${major}.x`;
  }

  const chromiumMod = await import("@sparticuz/chromium");
  const chromium = chromiumMod.default;

  try {
    chromium.setGraphicsMode = false;
  } catch {
    /* ignore */
  }

  const localBin = resolveLocalChromiumBin();
  const executablePath = localBin
    ? await chromium.executablePath(localBin)
    : await chromium.executablePath(CHROMIUM_REMOTE_PACK);

  await verifyChromiumExecutable(executablePath);
  configureSparticuzLambdaEnv(chromiumMod, executablePath);

  console.info(
    "[pdfBrowserPool]",
    JSON.stringify({
      event: "chromium_executable_resolved",
      executablePath,
      reused: Boolean(chromiumExecutablePromise),
    }),
  );

  return {
    executablePath,
    reused: false,
    extractionMs: Date.now() - started,
  };
}

/** One cached Sparticuz executable path per warm instance — guarded by a promise lock. */
async function resolveChromiumExecutable(): Promise<ChromiumExecutableResolution> {
  if (!chromiumExecutablePromise) {
    chromiumExecutablePromise = extractChromiumExecutable().catch((err) => {
      if (shouldResetChromiumExecutableCache(err)) {
        chromiumExecutablePromise = null;
        clearActiveChromiumExtract();
      }
      throw err;
    });
  }
  return chromiumExecutablePromise;
}

function resetChromiumExecutableCache(): void {
  chromiumExecutablePromise = null;
  clearActiveChromiumExtract();
}

function createProfileDir(): string {
  return path.join(slipTmpDir(), `${SLIP_PROFILE_PREFIX}${randomUUID()}`);
}

function createRenderWorkDir(): string {
  return path.join(slipTmpDir(), `${SLIP_RENDER_PREFIX}${randomUUID()}`);
}

async function launchRenderBrowserOnce(
  executablePath: string,
  profileDir: string,
  isServerless: boolean,
): Promise<Browser> {
  if (isServerless) {
    const chromiumMod = await import("@sparticuz/chromium");
    const chromium = chromiumMod.default;
    const puppeteer = await import("puppeteer-core");
    return puppeteer.default.launch({
      args: [...chromium.args, `--user-data-dir=${profileDir}`],
      // @sparticuz/chromium v149 exposes args only; A4 viewport for slip PDF.
      defaultViewport: { width: 794, height: 1123, deviceScaleFactor: 1 },
      executablePath,
      headless: true,
      userDataDir: profileDir,
    });
  }

  const systemChrome = resolveChromeExecutable();
  if (systemChrome) {
    const puppeteerCore = await import("puppeteer-core");
    return puppeteerCore.default.launch({
      executablePath: systemChrome,
      headless: true,
      args: [...CHROME_ARGS, `--user-data-dir=${profileDir}`],
      userDataDir: profileDir,
    });
  }

  throw new SlipRenderPoolError(
    "Chrome/Chromium not found for PDF generation. Install Google Chrome/Edge or set CHROME_PATH.",
    "CHROME_NOT_FOUND",
    false,
  );
}

async function launchRenderBrowserWithRetry(isServerless: boolean): Promise<{
  browser: Browser;
  profileDir: string;
  renderWorkDir: string;
  browserLaunchMs: number;
  executableReused: boolean;
  extractionMs: number;
}> {
  const profileDir = createProfileDir();
  const renderWorkDir = createRenderWorkDir();
  await fs.promises.mkdir(profileDir, { recursive: true });
  await fs.promises.mkdir(renderWorkDir, { recursive: true });

  const launchStarted = Date.now();
  let executableReused = false;
  let extractionMs = 0;
  let executablePath = "";

  try {
    if (isServerless) {
      await ensureTmpFreeSpace(TMP_FREE_MIN_RENDER_BYTES);
      const resolved = await resolveChromiumExecutable();
      executablePath = resolved.executablePath;
      executableReused = resolved.reused;
      extractionMs = resolved.extractionMs;
    }

    let lastLaunchError: unknown;
    for (let launchAttempt = 1; launchAttempt <= MAX_LAUNCH_ATTEMPTS; launchAttempt++) {
      try {
        if (isServerless) {
          await verifyChromiumExecutable(executablePath);
        }
        const browser = await launchRenderBrowserOnce(
          executablePath,
          profileDir,
          isServerless,
        );
        return {
          browser,
          profileDir,
          renderWorkDir,
          browserLaunchMs: Date.now() - launchStarted,
          executableReused,
          extractionMs,
        };
      } catch (err) {
        lastLaunchError = err;
        if (isBrowserLaunchFailure(err) || launchAttempt >= MAX_LAUNCH_ATTEMPTS) {
          const msg = err instanceof Error ? err.message : "Browser launch failed";
          throw new SlipRenderPoolError(msg, "BROWSER_LAUNCH_FAILED", false);
        }
        if (shouldResetChromiumExecutableCache(err)) {
          resetChromiumExecutableCache();
          if (isServerless) {
            const resolved = await resolveChromiumExecutable();
            executablePath = resolved.executablePath;
            executableReused = resolved.reused;
            extractionMs = resolved.extractionMs;
          }
        }
        const delay = LAUNCH_RETRY_DELAYS_MS[launchAttempt - 1] ?? 1000;
        await sleep(delay);
      }
    }
    throw lastLaunchError;
  } catch (err) {
    await fs.promises.rm(profileDir, { recursive: true, force: true }).catch(() => {});
    await fs.promises.rm(renderWorkDir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
}

async function disposeRenderSession(input: {
  browser: Browser | null;
  page: Page | null;
  profileDir: string;
  renderWorkDir: string;
}): Promise<void> {
  if (input.page) {
    await input.page.close().catch(() => {});
  }
  if (input.browser?.connected) {
    await input.browser.close().catch(() => {});
  }
  await fs.promises.rm(input.profileDir, { recursive: true, force: true }).catch(() => {});
  await fs.promises.rm(input.renderWorkDir, { recursive: true, force: true }).catch(() => {});
}

export type HtmlToPdfOptions = {
  url: string;
  rootSelector: string;
  validateHtml?: (html: string) => void;
  viewport?: { width: number; height: number };
  slipKind?: PremiumSlipKind;
  bookingId?: number;
};

export type PremiumSlipPdfRenderResult = {
  pdf: Buffer;
  slipKind: PremiumSlipKind;
  templateVersion: string;
  htmlValidated: true;
};

export async function renderHtmlUrlToPdf(
  opts: HtmlToPdfOptions & { slipKind: PremiumSlipKind },
): Promise<PremiumSlipPdfRenderResult>;
export async function renderHtmlUrlToPdf(opts: HtmlToPdfOptions): Promise<Buffer>;
export async function renderHtmlUrlToPdf(
  opts: HtmlToPdfOptions,
): Promise<Buffer | PremiumSlipPdfRenderResult> {
  return enqueueSlipRender(async () => {
    beginSlipRender();
    let lastError: unknown;
    const renderStarted = Date.now();
    let freeTmpBefore: number | null = null;

    try {
      freeTmpBefore = await measureTmpFreeBytes();

      for (let attempt = 1; attempt <= MAX_RENDER_ATTEMPTS; attempt++) {
        let browser: Browser | null = null;
        let page: Page | null = null;
        let profileDir = "";
        let renderWorkDir = "";
        let executableReused = false;
        let extractionMs = 0;
        let browserLaunchMs = 0;
        let pageLoadMs = 0;
        let pdfMs = 0;

        try {
          if (attempt > 1) {
            await cleanSlipTempDirs();
            await ensureTmpFreeSpace(TMP_FREE_MIN_RENDER_BYTES);
          }

          const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_VERSION);
          ({
            browser,
            profileDir,
            renderWorkDir,
            browserLaunchMs,
            executableReused,
            extractionMs,
          } = await launchRenderBrowserWithRetry(isServerless));

          page = await browser.newPage();
          page.setDefaultNavigationTimeout(90_000);
          page.setDefaultTimeout(60_000);

          const viewport = opts.viewport ?? { width: 794, height: 1123 };
          await page.setViewport({ ...viewport, deviceScaleFactor: 1 });

          const pageLoadStarted = Date.now();
          const response = await page.goto(opts.url, {
            waitUntil: "networkidle0",
            timeout: 90_000,
          });
          pageLoadMs = Date.now() - pageLoadStarted;

          if (!response || !response.ok()) {
            const status = response?.status() ?? "unknown";
            const finalUrl = page.url();
            const loginRedirected = finalUrl.includes("/login");
            const detail = loginRedirected
              ? " — redirected to login (check PDF_RENDER_SECRET / CRON_SECRET)"
              : "";
            throw new SlipRenderPoolError(
              `PDF page failed to load (HTTP ${status})${detail}`,
              loginRedirected ? "AUTH_REDIRECT" : `HTTP_${status}`,
            );
          }

          await page.waitForSelector(opts.rootSelector, { timeout: 30_000 });
          const html = await page.content();
          opts.validateHtml?.(html);

          await page.emulateMediaType("print");
          await page.evaluate(async () => {
            const images = Array.from(document.images);
            await Promise.all(
              images.map((img) =>
                img.complete
                  ? Promise.resolve()
                  : new Promise<void>((resolve) => {
                      img.onload = () => resolve();
                      img.onerror = () => resolve();
                    }),
              ),
            );
          });

          if (opts.slipKind) {
            await validatePremiumSlipDom(page, opts.slipKind);
          }

          await preparePremiumSlipMarkersForPdf(page);

          const pdfStarted = Date.now();
          const pdf = await page.pdf({
            format: "A4",
            printBackground: true,
            margin: { top: 0, right: 0, bottom: 0, left: 0 },
            timeout: 60_000,
          });
          pdfMs = Date.now() - pdfStarted;

          const buffer = Buffer.from(pdf);
          const freeTmpAfter = await measureTmpFreeBytes();

          if (opts.slipKind && opts.bookingId != null) {
            logSlipRenderDiagnostic({
              kind: opts.slipKind,
              bookingId: opts.bookingId,
              attempt,
              freeTmpBefore,
              freeTmpAfter,
              durationMs: Date.now() - renderStarted,
              ok: true,
              executableReused,
              extractionMs,
              browserLaunchMs,
              pageLoadMs,
              pdfMs,
            });
          }

          if (opts.slipKind) {
            return {
              pdf: buffer,
              slipKind: opts.slipKind,
              templateVersion: "premium-slip-v1",
              htmlValidated: true as const,
            };
          }
          return buffer;
        } catch (err) {
          lastError = err;
          const errorCode = errorCodeFromUnknown(err);
          const freeTmpAfter = await measureTmpFreeBytes();

          if (opts.slipKind && opts.bookingId != null) {
            logSlipRenderDiagnostic({
              kind: opts.slipKind,
              bookingId: opts.bookingId,
              attempt,
              freeTmpBefore,
              freeTmpAfter,
              durationMs: Date.now() - renderStarted,
              ok: false,
              errorCode,
              executableReused,
              extractionMs,
              browserLaunchMs,
              pageLoadMs,
              pdfMs,
            });
          }

          const retryable = isRetryableSlipRenderError(err);
          if (retryable && attempt < MAX_RENDER_ATTEMPTS) {
            if (shouldResetChromiumExecutableCache(err)) {
              resetChromiumExecutableCache();
            }
            await cleanSlipTempDirs();
            await sleep(LAUNCH_RETRY_DELAYS_MS[attempt - 1] ?? 1000);
            continue;
          }
          if (attempt >= MAX_RENDER_ATTEMPTS) break;
          if (!retryable) break;
        } finally {
          await disposeRenderSession({ browser, page, profileDir, renderWorkDir });
        }
      }

      const code = errorCodeFromUnknown(lastError);
      if (isEnospcError(lastError)) {
        throw new SlipRenderPoolError("Slip PDF render failed: /tmp full (ENOSPC)", "ENOSPC");
      }
      if (isSpawnBusyError(lastError)) {
        throw new SlipRenderPoolError(
          "Slip PDF render failed: Chromium busy (ETXTBSY) — retry slip send",
          "ETXTBSY",
        );
      }
      if (lastError instanceof SlipRenderPoolError) throw lastError;
      const msg = lastError instanceof Error ? lastError.message : "PDF generation failed";
      const nonRetryable = isNonRetryablePremiumRenderError(lastError);
      throw new SlipRenderPoolError(msg, code, !nonRetryable);
    } finally {
      endSlipRender();
    }
  });
}

/** Test hook — reset cached Chromium extraction between tests. */
export function __resetChromiumExecutableCacheForTests(): void {
  chromiumExecutablePromise = null;
  clearActiveChromiumExtract();
}

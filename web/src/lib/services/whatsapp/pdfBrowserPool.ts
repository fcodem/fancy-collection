import "server-only";

import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { Browser, Page } from "puppeteer-core";
import {
  cleanSlipTempDirs,
  ensureSlipTempHeadroom,
  getTmpDir,
  measureSlipTempUsage,
  TMP_USAGE_WARN_BYTES,
  isEnospcError,
  errorCodeFromUnknown,
} from "@/lib/slipTempCleanup";
import { SlipRenderPoolError } from "./slipRenderErrors";

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

const MAX_RENDER_ATTEMPTS = 2;

let renderQueue: Promise<unknown> = Promise.resolve();
let chromiumExecutablePromise: Promise<string> | null = null;

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

async function extractChromiumExecutable(): Promise<string> {
  await ensureSlipTempHeadroom();
  const usage = measureSlipTempUsage();
  if (usage >= TMP_USAGE_WARN_BYTES) {
    throw new SlipRenderPoolError(
      "Insufficient /tmp headroom before Chromium extraction",
      "ENOSPC",
    );
  }

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
  let executablePath: string;
  if (localBin) {
    executablePath = await chromium.executablePath(localBin);
  } else {
    console.warn(
      "[pdfBrowserPool] @sparticuz/chromium/bin missing from bundle — downloading remote pack",
    );
    executablePath = await chromium.executablePath(CHROMIUM_REMOTE_PACK);
  }

  const execDir = path.dirname(executablePath);
  if (typeof chromiumMod.setupLambdaEnvironment === "function") {
    chromiumMod.setupLambdaEnvironment(execDir);
  } else {
    const existingLd = process.env.LD_LIBRARY_PATH?.trim();
    process.env.LD_LIBRARY_PATH = existingLd
      ? `${execDir}${path.delimiter}${existingLd}`
      : execDir;
  }

  return executablePath;
}

/** One cached Chromium executable path per warm instance — guarded by a promise lock. */
async function resolveChromiumExecutable(): Promise<string> {
  if (!chromiumExecutablePromise) {
    chromiumExecutablePromise = extractChromiumExecutable().catch((err) => {
      chromiumExecutablePromise = null;
      throw err;
    });
  }
  return chromiumExecutablePromise;
}

function createProfileDir(): string {
  return path.join(getTmpDir(), `puppeteer_dev_chrome_profile-${randomUUID()}`);
}

async function launchRenderBrowser(): Promise<{ browser: Browser; profileDir: string }> {
  const profileDir = createProfileDir();
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_VERSION);

  try {
    if (isServerless) {
      const executablePath = await resolveChromiumExecutable();
      const chromiumMod = await import("@sparticuz/chromium");
      const chromium = chromiumMod.default;
      const puppeteer = await import("puppeteer-core");
      const browser = await puppeteer.default.launch({
        args: [
          ...chromium.args,
          "--hide-scrollbars",
          "--disable-web-security",
          `--user-data-dir=${profileDir}`,
        ],
        defaultViewport: { width: 794, height: 1123 },
        executablePath,
        headless: true,
        userDataDir: profileDir,
      });
      return { browser, profileDir };
    }

    const systemChrome = resolveChromeExecutable();
    if (systemChrome) {
      const puppeteerCore = await import("puppeteer-core");
      const browser = await puppeteerCore.default.launch({
        executablePath: systemChrome,
        headless: true,
        args: [...CHROME_ARGS, `--user-data-dir=${profileDir}`],
        userDataDir: profileDir,
      });
      return { browser, profileDir };
    }

    throw new SlipRenderPoolError(
      "Chrome/Chromium not found for PDF generation. Install Google Chrome/Edge or set CHROME_PATH.",
      "CHROME_NOT_FOUND",
    );
  } catch (err) {
    await fs.promises.rm(profileDir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
}

async function disposeRenderBrowser(browser: Browser | null, profileDir: string): Promise<void> {
  if (browser?.connected) {
    await browser.close().catch(() => {});
  }
  await fs.promises.rm(profileDir, { recursive: true, force: true }).catch(() => {});
}

function enqueueRender<T>(fn: () => Promise<T>): Promise<T> {
  const run = renderQueue.then(fn, fn);
  renderQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export type HtmlToPdfOptions = {
  url: string;
  rootSelector: string;
  validateHtml?: (html: string) => void;
  viewport?: { width: number; height: number };
};

export async function renderHtmlUrlToPdf(opts: HtmlToPdfOptions): Promise<Buffer> {
  return enqueueRender(async () => {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_RENDER_ATTEMPTS; attempt++) {
      let browser: Browser | null = null;
      let page: Page | null = null;
      let profileDir = "";

      try {
        if (attempt > 1 || measureSlipTempUsage() >= TMP_USAGE_WARN_BYTES) {
          await cleanSlipTempDirs();
        }

        ({ browser, profileDir } = await launchRenderBrowser());
        page = await browser.newPage();
        page.setDefaultNavigationTimeout(90_000);
        page.setDefaultTimeout(60_000);

        const viewport = opts.viewport ?? { width: 794, height: 1123 };
        await page.setViewport({ ...viewport, deviceScaleFactor: 1 });

        const response = await page.goto(opts.url, {
          waitUntil: "networkidle0",
          timeout: 90_000,
        });
        if (!response || !response.ok()) {
          const status = response?.status() ?? "unknown";
          throw new Error(`PDF page failed to load (HTTP ${status})`);
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

        const pdf = await page.pdf({
          format: "A4",
          printBackground: true,
          margin: { top: 0, right: 0, bottom: 0, left: 0 },
          timeout: 60_000,
        });

        return Buffer.from(pdf);
      } catch (err) {
        lastError = err;
        const enospc = isEnospcError(err);
        if (enospc && attempt < MAX_RENDER_ATTEMPTS) {
          await cleanSlipTempDirs();
          continue;
        }
        if (attempt >= MAX_RENDER_ATTEMPTS) break;
        if (enospc) break;
      } finally {
        if (page) await page.close().catch(() => {});
        await disposeRenderBrowser(browser, profileDir);
      }
    }

    const code = errorCodeFromUnknown(lastError);
    if (isEnospcError(lastError)) {
      throw new SlipRenderPoolError("Slip PDF render failed: /tmp full (ENOSPC)", "ENOSPC");
    }
    if (lastError instanceof SlipRenderPoolError) throw lastError;
    const msg = lastError instanceof Error ? lastError.message : "PDF generation failed";
    throw new SlipRenderPoolError(msg, code);
  });
}

/** Test hook — reset cached Chromium extraction between tests. */
export function __resetChromiumExecutableCacheForTests(): void {
  chromiumExecutablePromise = null;
}

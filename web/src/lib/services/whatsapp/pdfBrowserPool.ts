import "server-only";

import fs from "fs";
import path from "path";
import type { Browser, Page } from "puppeteer-core";

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

const IDLE_CLOSE_MS = 120_000;
const MAX_RENDER_ATTEMPTS = 2;

let browserInstance: Browser | null = null;
let browserLaunch: Promise<Browser> | null = null;
let renderQueue: Promise<unknown> = Promise.resolve();
let idleTimer: ReturnType<typeof setTimeout> | null = null;

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
    const path = candidate.trim();
    if (path && fs.existsSync(path)) return path;
  }
  return undefined;
}

/**
 * Vercel Fluid Compute omits AWS Lambda env vars that @sparticuz/chromium uses
 * to unpack AL2023 libs (libnss3.so). Hint the runtime before import, then set
 * LD_LIBRARY_PATH to the extracted binary directory.
 *
 * Next/NFT sometimes drops `node_modules/@sparticuz/chromium/bin` from the
 * serverless bundle — fall back to the official remote pack URL when bin is missing.
 */
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

async function launchServerlessBrowser(): Promise<Browser> {
  if (!process.env.AWS_LAMBDA_JS_RUNTIME) {
    const major = Number(process.versions.node.split(".")[0]) || 22;
    process.env.AWS_LAMBDA_JS_RUNTIME = `nodejs${major}.x`;
  }

  const chromiumMod = await import("@sparticuz/chromium");
  const chromium = chromiumMod.default;
  const puppeteer = await import("puppeteer-core");

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

  return puppeteer.default.launch({
    args: [...chromium.args, "--hide-scrollbars", "--disable-web-security"],
    defaultViewport: { width: 794, height: 1123 },
    executablePath,
    headless: true,
  });
}

async function launchFreshBrowser(): Promise<Browser> {
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_VERSION);

  if (isServerless) {
    return launchServerlessBrowser();
  }

  try {
    const puppeteer = await import("puppeteer");
    const execPath = puppeteer.default.executablePath();
    if (execPath && fs.existsSync(execPath)) {
      return puppeteer.default.launch({
        executablePath: execPath,
        headless: true,
        args: CHROME_ARGS,
      });
    }
  } catch {
    // puppeteer full package optional in some installs
  }

  const systemChrome = resolveChromeExecutable();
  if (systemChrome) {
    const puppeteerCore = await import("puppeteer-core");
    return puppeteerCore.default.launch({
      executablePath: systemChrome,
      headless: true,
      args: CHROME_ARGS,
    });
  }

  const hint =
    "Install Google Chrome, set CHROME_PATH in .env.local, or run: npx puppeteer browsers install chrome";
  throw new Error(`Chrome/Chromium not found for PDF generation. ${hint}`);
}

async function getBrowser(): Promise<Browser> {
  if (browserInstance?.connected) return browserInstance;

  if (!browserLaunch) {
    browserLaunch = launchFreshBrowser()
      .then((browser) => {
        browserInstance = browser;
        browser.on("disconnected", () => {
          browserInstance = null;
          browserLaunch = null;
        });
        return browser;
      })
      .catch((err) => {
        browserLaunch = null;
        throw err;
      });
  }

  return browserLaunch;
}

async function closeBrowser() {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  const browser = browserInstance;
  browserInstance = null;
  browserLaunch = null;
  if (browser?.connected) {
    await browser.close().catch(() => {});
  }
}

function scheduleIdleClose() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    void closeBrowser();
  }, IDLE_CLOSE_MS);
}

function enqueueRender<T>(fn: () => Promise<T>): Promise<T> {
  const run = renderQueue.then(fn, fn);
  renderQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function resetBrowser() {
  await closeBrowser();
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
      let page: Page | null = null;
      try {
        const browser = await getBrowser();
        page = await browser.newPage();
        page.setDefaultNavigationTimeout(90_000);
        page.setDefaultTimeout(60_000);

        const viewport = opts.viewport ?? { width: 794, height: 1123 };
        await page.setViewport({ ...viewport, deviceScaleFactor: 1 });

        const response = await page.goto(opts.url, { waitUntil: "networkidle0", timeout: 90_000 });
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

        scheduleIdleClose();
        return Buffer.from(pdf);
      } catch (err) {
        lastError = err;
        await resetBrowser();
        if (attempt >= MAX_RENDER_ATTEMPTS) break;
      } finally {
        if (page) await page.close().catch(() => {});
      }
    }

    throw lastError instanceof Error ? lastError : new Error("PDF generation failed");
  });
}

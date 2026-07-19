/**
 * Slip/Chromium temp cleanup helpers (safe prefix-only deletion under os.tmpdir()).
 */
import fs from "fs";
import os from "os";
import path from "path";

/** Safe tmp prefixes for Chromium/Puppeteer slip renders — never delete outside these. */
export const SLIP_TMP_PREFIXES = [
  "puppeteer_dev_chrome_profile-",
  "fc-slip-",
  "chromium-slip-",
] as const;

/** @deprecated alias */
export const SLIP_TEMP_PREFIXES = SLIP_TMP_PREFIXES;

/** Warn and proactively clean when slip temp usage exceeds this threshold. */
export const TMP_USAGE_WARN_BYTES = 200 * 1024 * 1024;

export function slipTmpDir(): string {
  return os.tmpdir();
}

/** @deprecated alias */
export const getTmpDir = slipTmpDir;

export function isSlipTempEntryName(name: string): boolean {
  return SLIP_TMP_PREFIXES.some((prefix) => name.startsWith(prefix));
}

function entryBytes(fullPath: string, entry: fs.Dirent): number {
  try {
    if (entry.isFile()) return fs.statSync(fullPath).size;
    if (entry.isDirectory()) return dirSize(fullPath);
  } catch {
    /* ignore */
  }
  return 0;
}

function dirSize(dir: string): number {
  let total = 0;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    total += entryBytes(path.join(dir, entry.name), entry);
  }
  return total;
}

/** Sum bytes for all entries under os.tmpdir() (diagnostics). */
export function tmpUsageBytes(dir = slipTmpDir()): number {
  let total = 0;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    total += entryBytes(path.join(dir, entry.name), entry);
  }
  return total;
}

/** Sum bytes used by slip/Chromium temp entries only. */
export function measureSlipTempUsage(tmpDir = slipTmpDir()): number {
  let total = 0;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(tmpDir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    if (!isSlipTempEntryName(entry.name)) continue;
    total += entryBytes(path.join(tmpDir, entry.name), entry);
  }
  return total;
}

function isWithinTmpDir(tmpDir: string, target: string): boolean {
  const resolvedTmp = path.resolve(tmpDir);
  const resolvedTarget = path.resolve(target);
  return resolvedTarget === resolvedTmp || resolvedTarget.startsWith(resolvedTmp + path.sep);
}

export type CleanupSlipTempOpts = {
  maxAgeMs?: number;
  tmpDir?: string;
};

/**
 * Delete slip/Chromium temp dirs matching known prefixes.
 * Prefix-only guard — never rm -rf arbitrary paths.
 */
export function cleanupSlipTempDirs(opts?: CleanupSlipTempOpts): number {
  const tmpDir = opts?.tmpDir ?? slipTmpDir();
  const maxAgeMs = opts?.maxAgeMs ?? 0;
  const now = Date.now();
  let removed = 0;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(tmpDir, { withFileTypes: true });
  } catch {
    return 0;
  }

  for (const entry of entries) {
    if (!isSlipTempEntryName(entry.name)) continue;
    const fullPath = path.join(tmpDir, entry.name);
    if (!isWithinTmpDir(tmpDir, fullPath)) continue;

    try {
      const st = fs.statSync(fullPath);
      if (maxAgeMs > 0 && now - st.mtimeMs < maxAgeMs) continue;
      fs.rmSync(fullPath, { recursive: true, force: true });
      removed += 1;
    } catch {
      /* best effort */
    }
  }

  return removed;
}

/** Async wrapper used by the render route. Returns approximate bytes freed. */
export async function cleanSlipTempDirs(tmpDir = slipTmpDir()): Promise<number> {
  const before = measureSlipTempUsage(tmpDir);
  cleanupSlipTempDirs({ maxAgeMs: 0, tmpDir });
  const after = measureSlipTempUsage(tmpDir);
  return Math.max(0, before - after);
}

export async function ensureSlipTempHeadroom(tmpDir = slipTmpDir()): Promise<void> {
  if (measureSlipTempUsage(tmpDir) >= TMP_USAGE_WARN_BYTES) {
    await cleanSlipTempDirs(tmpDir);
  }
}

export function isEnospcError(err: unknown): boolean {
  if (!err) return false;
  const code = (err as NodeJS.ErrnoException)?.code;
  if (code === "ENOSPC") return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /ENOSPC|no space left on device/i.test(msg);
}

export function errorCodeFromUnknown(err: unknown): string | undefined {
  if (!err) return undefined;
  if (isEnospcError(err)) return "ENOSPC";
  const code = (err as NodeJS.ErrnoException)?.code;
  if (typeof code === "string" && code) return code;
  if (err instanceof Error && "errorCode" in err) {
    const ec = (err as { errorCode?: string }).errorCode;
    if (ec) return ec;
  }
  return undefined;
}

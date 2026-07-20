/**
 * Slip/Chromium temp cleanup helpers (safe prefix-only deletion under os.tmpdir()).
 */
import fs from "fs";
import os from "os";
import path from "path";
import { measureTmpSpace } from "@/lib/tmpSpace";

export const CHROMIUM_PACK_VERSION = "149";
export const CHROMIUM_EXTRACT_DIR_NAME = `fc-chromium-v${CHROMIUM_PACK_VERSION}`;
export const SLIP_PROFILE_PREFIX = "fc-slip-profile-";
export const SLIP_RENDER_PREFIX = "fc-slip-render-";

/** Minimum free /tmp before extracting Chromium (~180 MB). */
export const TMP_FREE_MIN_EXTRACTION_BYTES = 180 * 1024 * 1024;

/** Minimum free /tmp before rendering with an existing executable (~80 MB). */
export const TMP_FREE_MIN_RENDER_BYTES = 80 * 1024 * 1024;

/** Legacy + current prefixes eligible for stale cleanup. */
export const SLIP_TMP_PREFIXES = [
  SLIP_PROFILE_PREFIX,
  SLIP_RENDER_PREFIX,
  "fc-chromium-v",
  "puppeteer_dev_chrome_profile-",
  "fc-slip-",
  "chromium-slip-",
] as const;

/** @deprecated alias */
export const SLIP_TEMP_PREFIXES = SLIP_TMP_PREFIXES;

/** @deprecated — prefer TMP_FREE_MIN_RENDER_BYTES + measureTmpFreeBytes */
export const TMP_USAGE_WARN_BYTES = TMP_FREE_MIN_RENDER_BYTES;

export function slipTmpDir(): string {
  return os.tmpdir();
}

/** @deprecated alias */
export const getTmpDir = slipTmpDir;

export function chromiumExtractDir(tmpDir = slipTmpDir()): string {
  return path.join(tmpDir, CHROMIUM_EXTRACT_DIR_NAME);
}

export function chromiumExecutablePath(tmpDir = slipTmpDir()): string {
  return path.join(chromiumExtractDir(tmpDir), "chromium");
}

export function isSlipTempEntryName(name: string): boolean {
  return SLIP_TMP_PREFIXES.some((prefix) => name.startsWith(prefix));
}

let activeRenderCount = 0;
let protectedChromiumExtractDir: string | null = null;
let protectedChromiumExecutable: string | null = null;

export function beginSlipRender(): void {
  activeRenderCount += 1;
}

export function endSlipRender(): void {
  activeRenderCount = Math.max(0, activeRenderCount - 1);
}

export function getActiveRenderCount(): number {
  return activeRenderCount;
}

/** Register the reusable Chromium extract dir so cleanup never deletes it while warm. */
export function registerActiveChromiumExtract(
  extractDir: string,
  executablePath: string,
): void {
  protectedChromiumExtractDir = path.resolve(extractDir);
  protectedChromiumExecutable = path.resolve(executablePath);
}

export function clearActiveChromiumExtract(): void {
  protectedChromiumExtractDir = null;
  protectedChromiumExecutable = null;
}

export function getProtectedChromiumExtractDir(): string | null {
  return protectedChromiumExtractDir;
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

export async function measureTmpFreeBytes(tmpDir = slipTmpDir()): Promise<number | null> {
  const snapshot = await measureTmpSpace(tmpDir);
  return snapshot.freeBytes;
}

function isWithinTmpDir(tmpDir: string, target: string): boolean {
  const resolvedTmp = path.resolve(tmpDir);
  const resolvedTarget = path.resolve(target);
  return resolvedTarget === resolvedTmp || resolvedTarget.startsWith(resolvedTmp + path.sep);
}

function isProtectedSlipTempPath(fullPath: string, tmpDir: string): boolean {
  const resolved = path.resolve(fullPath);
  if (protectedChromiumExecutable && resolved === protectedChromiumExecutable) return true;
  if (protectedChromiumExtractDir) {
    if (
      resolved === protectedChromiumExtractDir ||
      resolved.startsWith(protectedChromiumExtractDir + path.sep)
    ) {
      return true;
    }
  }
  if (activeRenderCount > 0 && protectedChromiumExtractDir) {
    if (
      resolved === protectedChromiumExtractDir ||
      resolved.startsWith(protectedChromiumExtractDir + path.sep)
    ) {
      return true;
    }
  }
  void tmpDir;
  return false;
}

function isObsoleteChromiumExtract(name: string): boolean {
  return name.startsWith("fc-chromium-v") && name !== CHROMIUM_EXTRACT_DIR_NAME;
}

export type CleanupSlipTempOpts = {
  maxAgeMs?: number;
  tmpDir?: string;
};

/**
 * Delete stale slip/Chromium temp dirs matching known prefixes.
 * Never removes the active extracted Chromium executable tree.
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
    if (isProtectedSlipTempPath(fullPath, tmpDir)) continue;

    // Keep the current version extract unless it is obsolete.
    if (entry.name === CHROMIUM_EXTRACT_DIR_NAME) continue;
    if (entry.name.startsWith("fc-chromium-v") && !isObsoleteChromiumExtract(entry.name)) {
      continue;
    }

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
  await ensureTmpFreeSpace(TMP_FREE_MIN_RENDER_BYTES, tmpDir);
}

export async function ensureTmpFreeSpace(
  minBytes: number,
  tmpDir = slipTmpDir(),
): Promise<number> {
  let free = await measureTmpFreeBytes(tmpDir);
  if (free != null && free >= minBytes) return free;

  cleanupSlipTempDirs({ maxAgeMs: 0, tmpDir });
  free = await measureTmpFreeBytes(tmpDir);
  if (free != null && free >= minBytes) return free;

  const err = new Error(
    `Insufficient /tmp free space (need ${Math.round(minBytes / (1024 * 1024))}MB, ` +
      `have ${free == null ? "unknown" : `${Math.round(free / (1024 * 1024))}MB`})`,
  ) as NodeJS.ErrnoException;
  err.code = "ENOSPC";
  throw err;
}

export async function verifyChromiumExecutable(executablePath: string): Promise<void> {
  if (!fs.existsSync(executablePath)) {
    const err = new Error(`Chromium executable missing at ${executablePath}`) as NodeJS.ErrnoException;
    err.code = "ENOENT";
    throw err;
  }
  const stat = fs.statSync(executablePath);
  if (!stat.isFile() || stat.size <= 0) {
    const err = new Error(`Chromium executable corrupt (${stat.size} bytes)`) as NodeJS.ErrnoException;
    err.code = "ENOENT";
    throw err;
  }
  try {
    await fs.promises.access(executablePath, fs.constants.X_OK);
  } catch {
    // Windows may not honor X_OK — size + exists is enough there.
    if (process.platform !== "win32") throw new Error(`Chromium executable not executable: ${executablePath}`);
  }
}

export function isEnospcError(err: unknown): boolean {
  if (!err) return false;
  const code = (err as NodeJS.ErrnoException)?.code;
  if (code === "ENOSPC") return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /ENOSPC|no space left on device|Insufficient \/tmp free space/i.test(msg);
}

/** Chromium binary still being written/extracted — retry after cleanup. */
export function isSpawnBusyError(err: unknown): boolean {
  if (!err) return false;
  const code = (err as NodeJS.ErrnoException)?.code;
  if (code === "ETXTBSY" || code === "EBUSY") return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /\bETXTBSY\b|\bEBUSY\b|text file busy|Chromium busy/i.test(msg);
}

export function isExecutableMissingError(err: unknown): boolean {
  if (!err) return false;
  const code = (err as NodeJS.ErrnoException)?.code;
  if (code === "ENOENT") return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /\bENOENT\b|executable missing|executable corrupt/i.test(msg);
}

/** ETXTBSY / EBUSY / ENOENT during browser executable launch. */
export function isExecutableLaunchError(err: unknown): boolean {
  return isSpawnBusyError(err) || isExecutableMissingError(err);
}

export function isRetryableSlipRenderError(err: unknown): boolean {
  return isEnospcError(err) || isSpawnBusyError(err) || isExecutableMissingError(err);
}

export function shouldResetChromiumExecutableCache(err: unknown): boolean {
  return isSpawnBusyError(err) || isExecutableMissingError(err);
}

export function errorCodeFromUnknown(err: unknown): string | undefined {
  if (!err) return undefined;
  if (isEnospcError(err)) return "ENOSPC";
  if (isSpawnBusyError(err)) return "ETXTBSY";
  const code = (err as NodeJS.ErrnoException)?.code;
  if (typeof code === "string" && code) return code;
  if (err instanceof Error && "errorCode" in err) {
    const ec = (err as { errorCode?: string }).errorCode;
    if (ec) return ec;
  }
  return undefined;
}

/** Test hook — reset protected paths between tests. */
export function __resetSlipTempProtectionForTests(): void {
  activeRenderCount = 0;
  protectedChromiumExtractDir = null;
  protectedChromiumExecutable = null;
}

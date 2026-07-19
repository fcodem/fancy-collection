import fs from "fs";
import os from "os";
import path from "path";

/** Safe-to-delete slip/Chromium temp entry prefixes under os.tmpdir(). */
export const SLIP_TEMP_PREFIXES = [
  "puppeteer_dev_chrome_profile-",
  "fc-slip-",
  "chromium-slip-",
] as const;

/** Warn and proactively clean when /tmp slip usage exceeds this threshold. */
export const TMP_USAGE_WARN_BYTES = 200 * 1024 * 1024;

export function getTmpDir(): string {
  return os.tmpdir();
}

export function isSlipTempEntryName(name: string): boolean {
  return SLIP_TEMP_PREFIXES.some((prefix) => name.startsWith(prefix));
}

function entryBytes(fullPath: string, entry: fs.Dirent): number {
  try {
    if (entry.isFile()) {
      return fs.statSync(fullPath).size;
    }
    if (entry.isDirectory()) {
      return measureDirBytes(fullPath);
    }
  } catch {
    /* ignore inaccessible entries */
  }
  return 0;
}

function measureDirBytes(dir: string): number {
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

/** Sum bytes used by slip/Chromium temp entries in os.tmpdir(). */
export function measureSlipTempUsage(tmpDir = getTmpDir()): number {
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
  return (
    resolvedTarget === resolvedTmp ||
    resolvedTarget.startsWith(resolvedTmp + path.sep)
  );
}

/** Delete only prefix-matched slip temp dirs/files under os.tmpdir(). Returns bytes freed. */
export async function cleanSlipTempDirs(tmpDir = getTmpDir()): Promise<number> {
  let freed = 0;
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(tmpDir, { withFileTypes: true });
  } catch {
    return 0;
  }

  for (const entry of entries) {
    if (!isSlipTempEntryName(entry.name)) continue;
    const fullPath = path.join(tmpDir, entry.name);
    if (!isWithinTmpDir(tmpDir, fullPath)) continue;

    const before = entryBytes(fullPath, entry);
    try {
      await fs.promises.rm(fullPath, { recursive: true, force: true });
      freed += before;
    } catch {
      /* best effort */
    }
  }
  return freed;
}

export async function ensureSlipTempHeadroom(tmpDir = getTmpDir()): Promise<void> {
  if (measureSlipTempUsage(tmpDir) >= TMP_USAGE_WARN_BYTES) {
    await cleanSlipTempDirs(tmpDir);
  }
}

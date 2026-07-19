import { statfs } from "fs/promises";
import { tmpdir } from "os";

export type TmpSpaceSnapshot = {
  dir: string;
  freeBytes: number | null;
  totalBytes: number | null;
};

/** Best-effort /tmp (or OS temp dir) free-space probe for worker diagnostics. */
export async function measureTmpSpace(dir = tmpdir()): Promise<TmpSpaceSnapshot> {
  try {
    const stats = await statfs(dir);
    return {
      dir,
      freeBytes: Number(stats.bfree) * Number(stats.bsize),
      totalBytes: Number(stats.blocks) * Number(stats.bsize),
    };
  } catch {
    return { dir, freeBytes: null, totalBytes: null };
  }
}

export function formatTmpSpace(snapshot: TmpSpaceSnapshot): string {
  if (snapshot.freeBytes == null) return `${snapshot.dir}: unknown`;
  const mb = Math.round(snapshot.freeBytes / (1024 * 1024));
  return `${snapshot.dir}: ${mb}MB free`;
}

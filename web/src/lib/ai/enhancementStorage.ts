import { existsSync, statSync } from "fs";
import { join } from "path";
import { saveCompressedFromBuffer } from "@/lib/upload";
import { pipelineLog } from "./pipelineLogger";

export type SavedEnhancedImage = {
  path: string;
  bytes: number;
  absolutePath: string | null;
};

/** Save enhanced image to uploads/enhanced/ and verify it exists. */
export async function saveEnhancedImage(
  itemId: number,
  buffer: Buffer,
): Promise<SavedEnhancedImage> {
  if (!buffer.length) {
    throw new Error("Enhanced image buffer is empty");
  }

  pipelineLog(itemId, "saving_enhanced_image", `buffer=${buffer.length} bytes`);

  const path = await saveCompressedFromBuffer(buffer, "enhanced");
  if (!path?.trim()) {
    throw new Error("saveCompressedFromBuffer returned empty path");
  }

  const isRemote = path.startsWith("http://") || path.startsWith("https://");
  let absolutePath: string | null = null;
  let bytes = buffer.length;

  if (!isRemote) {
    const rel = path.replace(/^uploads\//, "");
    absolutePath = join(process.cwd(), "public", "uploads", rel);
    if (!existsSync(absolutePath)) {
      throw new Error(`Enhanced image file missing after save: ${absolutePath}`);
    }
    const stat = statSync(absolutePath);
    if (stat.size <= 0) {
      throw new Error(`Enhanced image file is empty: ${absolutePath}`);
    }
    bytes = stat.size;
  }

  pipelineLog(itemId, "enhanced_image_saved", path, { bytes, absolutePath });

  return { path, bytes, absolutePath };
}

export function verifyEnhancedPath(path: string | null | undefined): {
  ok: boolean;
  reason?: string;
  absolutePath?: string;
  bytes?: number;
} {
  if (!path?.trim()) return { ok: false, reason: "path is null or empty" };
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return { ok: true };
  }
  const rel = path.replace(/^uploads\//, "");
  const absolutePath = join(process.cwd(), "public", "uploads", rel);
  if (!existsSync(absolutePath)) {
    return { ok: false, reason: `file not found: ${absolutePath}`, absolutePath };
  }
  const stat = statSync(absolutePath);
  if (stat.size <= 0) {
    return { ok: false, reason: `file is empty: ${absolutePath}`, absolutePath };
  }
  return { ok: true, absolutePath, bytes: stat.size };
}

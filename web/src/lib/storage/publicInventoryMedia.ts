import { writeFile, mkdir, unlink } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { put, del } from "@vercel/blob";

export const REFUSED_TO_DELETE_PERMANENT_INVENTORY_MEDIA =
  "REFUSED_TO_DELETE_PERMANENT_INVENTORY_MEDIA";

export class PermanentInventoryMediaError extends Error {
  code: typeof REFUSED_TO_DELETE_PERMANENT_INVENTORY_MEDIA;

  constructor(message: string) {
    super(message);
    this.name = "PermanentInventoryMediaError";
    this.code = REFUSED_TO_DELETE_PERMANENT_INVENTORY_MEDIA;
  }
}

export type InventoryMediaFolder =
  | "dresses"
  | "jewellery"
  | "accessories"
  | "thumbnails"
  | "recognition";

function normalizePath(urlOrPath: string): string {
  const trimmed = urlOrPath.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      return decodeURIComponent(new URL(trimmed).pathname.replace(/^\//, ""));
    } catch {
      return trimmed;
    }
  }
  return trimmed.replace(/^\//, "");
}

function inventoryRelativePath(urlOrPath: string): string {
  const path = normalizePath(urlOrPath);
  return path.replace(/^uploads\//, "");
}

/** True when the stored value points at permanent catalogue / inventory media. */
export function isPermanentInventoryMedia(urlOrPath: string): boolean {
  if (!urlOrPath?.trim()) return false;
  const raw = urlOrPath.trim();
  if (/uploads\/private\//i.test(raw) || /(?:^|\/)private\//i.test(raw)) return false;
  if (/id-proofs?\//i.test(raw)) return false;

  const path = inventoryRelativePath(raw);
  if (/^inventory\//i.test(path)) return true;
  if (/^(originals|recognition|thumbs|enhanced|marketing)\//i.test(path)) return true;
  if (/^[a-f0-9]{32}\.(jpg|jpeg|png|webp)$/i.test(path)) return true;
  if (/recognition\/\d+-rec\.jpg$/i.test(path)) return true;
  return false;
}

export function requirePublicInventoryToken(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) {
    if (process.env.VERCEL || process.env.NODE_ENV === "production") {
      throw new Error(
        "Cannot save inventory photo: BLOB_READ_WRITE_TOKEN is missing from this deployment.",
      );
    }
    return "";
  }
  return token;
}

async function storePublicBuffer(bytes: Buffer, relativePath: string): Promise<string> {
  const fullPath = relativePath.startsWith("inventory/")
    ? relativePath
    : `inventory/${relativePath.replace(/^\/+/, "")}`;
  const token = requirePublicInventoryToken();
  if (token) {
    try {
      const blob = await put(`uploads/${fullPath}`, bytes, {
        access: "public",
        token,
        multipart: bytes.length > 4 * 1024 * 1024,
      });
      return blob.url;
    } catch (e) {
      const detail = e instanceof Error ? e.message : "Blob upload failed";
      throw new Error(`Inventory photo upload to Vercel Blob failed: ${detail}`);
    }
  }
  const dir = join(
    process.cwd(),
    "public",
    "uploads",
    fullPath.split("/").slice(0, -1).join("/"),
  );
  await mkdir(dir, { recursive: true });
  await writeFile(join(process.cwd(), "public", "uploads", fullPath), bytes);
  return fullPath;
}

export async function savePermanentInventoryImage(
  bytes: Buffer,
  folder: InventoryMediaFolder,
  filename?: string,
): Promise<string> {
  const name = filename ?? `${randomUUID().replace(/-/g, "")}.jpg`;
  return storePublicBuffer(bytes, `${folder}/${name}`);
}

export async function deletePermanentInventoryImage(
  stored: string | null | undefined,
  opts?: { allowInventoryReplacement?: boolean },
): Promise<void> {
  if (!stored?.trim()) return;
  if (isPermanentInventoryMedia(stored) && !opts?.allowInventoryReplacement) {
    throw new PermanentInventoryMediaError(
      "Refusing to delete permanent inventory media without explicit inventory replacement.",
    );
  }
  await deleteStoredPublic(stored);
}

export async function replacePermanentInventoryImage(
  previous: string | null | undefined,
  bytes: Buffer,
  folder: InventoryMediaFolder,
  filename?: string,
): Promise<string> {
  const saved = await savePermanentInventoryImage(bytes, folder, filename);
  if (previous?.trim()) {
    await deletePermanentInventoryImage(previous, { allowInventoryReplacement: true });
  }
  return saved;
}

async function deleteStoredPublic(stored: string): Promise<void> {
  if (stored.startsWith("http://") || stored.startsWith("https://")) {
    const token = requirePublicInventoryToken();
    if (token) {
      try {
        await del(stored, { token });
      } catch {
        /* file may already be gone */
      }
    }
    return;
  }

  const filename = stored.replace(/^uploads\//, "").replace(/^\//, "");
  try {
    await unlink(join(process.cwd(), "public", "uploads", filename));
  } catch {
    /* file may already be gone */
  }
}

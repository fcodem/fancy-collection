import { writeFile, mkdir, unlink } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { put, del, get } from "@vercel/blob";

export type PrivateBookingMediaFolder =
  | "id-proofs"
  | "jewellery-selections"
  | "orders"
  | "delivery-evidence"
  | "return-evidence"
  | "incomplete-returns"
  | "damage-evidence"
  | "fittings"
  | "measurements";

export const APPROVED_PRIVATE_MEDIA_FOLDERS: readonly PrivateBookingMediaFolder[] = [
  "id-proofs",
  "jewellery-selections",
  "orders",
  "delivery-evidence",
  "return-evidence",
  "incomplete-returns",
  "damage-evidence",
  "fittings",
  "measurements",
] as const;

export class PrivateMediaError extends Error {
  code:
    | "PRIVATE_BLOB_NOT_CONFIGURED"
    | "FILE_TOO_LARGE"
    | "INVALID_FILE"
    | "EMPTY_FILE"
    | "BLOB_UPLOAD_FAILED";

  constructor(
    message: string,
    code: PrivateMediaError["code"],
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "PrivateMediaError";
    this.code = code;
  }
}

/** Prefer ID_PROOF_BLOB_READ_WRITE_TOKEN; never fall back to public token. */
export function requirePrivateMediaToken(): string {
  const token =
    process.env.ID_PROOF_BLOB_READ_WRITE_TOKEN?.trim() ||
    process.env.ID_PROOF_READ_WRITE_TOKEN?.trim();
  if (!token) {
    throw new PrivateMediaError(
      "Private booking media storage is not configured.",
      "PRIVATE_BLOB_NOT_CONFIGURED",
    );
  }
  return token;
}

export function isPrivateBookingMedia(urlOrPath: string): boolean {
  const s = urlOrPath.trim();
  if (!s) return false;
  if (/uploads\/private\//i.test(s)) return true;
  if (/\.private\.blob\.vercel-storage\.com/i.test(s)) return true;
  for (const folder of APPROVED_PRIVATE_MEDIA_FOLDERS) {
    const legacy = new RegExp(`(?:^|/)${folder}/`, "i");
    if (legacy.test(s.replace(/^uploads\//, ""))) return true;
  }
  return false;
}

function privateRelativePath(folder: PrivateBookingMediaFolder, filename: string): string {
  return `private/${folder}/${filename}`;
}

async function storePrivateBuffer(
  bytes: Buffer,
  folder: PrivateBookingMediaFolder,
  filename: string,
): Promise<string> {
  const relative = privateRelativePath(folder, filename);
  const isProdLike = Boolean(process.env.VERCEL) || process.env.NODE_ENV === "production";
  const token = requirePrivateMediaToken();

  if (token) {
    try {
      const blob = await put(`uploads/${relative}`, bytes, {
        access: "private",
        token,
        multipart: bytes.length > 4 * 1024 * 1024,
      });
      return blob.url;
    } catch (e) {
      const detail = e instanceof Error ? e.name : "BlobUploadError";
      throw new PrivateMediaError("Private media upload failed.", "BLOB_UPLOAD_FAILED", {
        cause: e instanceof Error ? `${detail}:${e.message.slice(0, 120)}` : detail,
      });
    }
  }

  if (isProdLike) {
    throw new PrivateMediaError(
      "Private booking media storage is not configured.",
      "PRIVATE_BLOB_NOT_CONFIGURED",
    );
  }

  const localRelative = `${folder}/${filename}`;
  const dir = join(process.cwd(), "public", "uploads", folder);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename), bytes);
  return localRelative;
}

export async function savePrivateBookingMedia(
  bytes: Buffer,
  folder: PrivateBookingMediaFolder,
  extension: "jpg" | "png" | "webp" = "jpg",
): Promise<string> {
  const filename = `${randomUUID().replaceAll("-", "")}.${extension}`;
  return storePrivateBuffer(bytes, folder, filename);
}

export async function deletePrivateBookingMedia(
  stored: string | null | undefined,
): Promise<void> {
  if (!stored?.trim()) return;

  if (stored.startsWith("http://") || stored.startsWith("https://")) {
    const token = requirePrivateMediaToken();
    try {
      await del(stored, { token });
    } catch {
      /* file may already be gone */
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

export async function getPrivateBookingMedia(blobUrl: string) {
  const token = requirePrivateMediaToken();
  return get(blobUrl, { access: "private", token });
}

import { writeFile, mkdir, unlink } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { put, del } from "@vercel/blob";
import { ALLOWED_EXTENSIONS } from "./constants";

export { photoUrl } from "./photoUrl";

function extFromName(name: string) {
  const parts = name.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "jpg";
}

export async function saveUpload(file: File): Promise<string> {
  const ext = extFromName(file.name);
  if (!ALLOWED_EXTENSIONS.includes(ext)) throw new Error("Invalid file type");

  const bytes = Buffer.from(await file.arrayBuffer());
  const filename = `${randomUUID().replace(/-/g, "")}.${ext}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`uploads/${filename}`, bytes, { access: "public" });
    return blob.url;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN is required in production for photo uploads. " +
      "Add it in your Vercel environment variables."
    );
  }

  // Local development only — save to public/uploads/
  const dir = join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename), bytes);
  return filename;
}

/** Remove a stored upload (local filename or Vercel Blob URL). */
export async function deleteUpload(stored: string | null | undefined): Promise<void> {
  if (!stored?.trim()) return;

  if (stored.startsWith("http://") || stored.startsWith("https://")) {
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        await del(stored);
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

export async function deleteUploads(stored: Array<string | null | undefined>): Promise<void> {
  await Promise.all(stored.map((s) => deleteUpload(s)));
}

export async function saveIdProofUpload(file: File): Promise<string> {
  const ext = extFromName(file.name);
  if (!ALLOWED_EXTENSIONS.includes(ext)) throw new Error("Invalid file type");
  const bytes = Buffer.from(await file.arrayBuffer());
  const filename = `id-proofs/${randomUUID().replace(/-/g, "")}.${ext}`;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`uploads/${filename}`, bytes, { access: "public" });
    return blob.url;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("BLOB_READ_WRITE_TOKEN is required in production.");
  }
  const dir = join(process.cwd(), "public", "uploads", "id-proofs");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename), bytes);
  return filename;
}

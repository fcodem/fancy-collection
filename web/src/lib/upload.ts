import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { put } from "@vercel/blob";
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

  const dir = join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename), bytes);
  return filename;
}

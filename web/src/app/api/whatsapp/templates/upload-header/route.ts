import { NextRequest } from "next/server";
import { jsonError, jsonOk, isResponse, requireOwner } from "@/lib/api";
import { uploadTemplateMediaHandle } from "@/lib/services/whatsapp/metaApi";

const ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/3gpp",
  "application/pdf",
]);

/** Owner-only: upload header sample to Meta and return header_handle for template creation. */
export async function POST(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError("Expected multipart/form-data with a file field.");
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return jsonError("Upload a non-empty file (JPEG, PNG, WebP, MP4, or PDF).");
  }

  const mimeType = (file.type || "image/png").trim().toLowerCase();
  if (!ALLOWED_MIMES.has(mimeType)) {
    return jsonError(
      "Unsupported file type. Use JPEG, PNG, WebP, MP4, 3GPP, or PDF for template headers.",
    );
  }

  const maxBytes = mimeType.startsWith("video/") ? 16 * 1024 * 1024 : 5 * 1024 * 1024;
  if (file.size > maxBytes) {
    return jsonError(`File too large. Max ${mimeType.startsWith("video/") ? "16MB" : "5MB"}.`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "header_sample";

  const uploaded = await uploadTemplateMediaHandle(buffer, safeName, mimeType);
  if (!uploaded.ok) {
    return jsonError(uploaded.error, 500);
  }

  return jsonOk({
    ok: true,
    handle: uploaded.handle,
    mimeType,
    filename: safeName,
  });
}

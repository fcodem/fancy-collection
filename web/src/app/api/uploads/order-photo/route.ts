import { NextRequest } from "next/server";
import { requireUser, isResponse, jsonError, jsonOk } from "@/lib/api";
import { saveUpload } from "@/lib/upload";

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (isResponse(user)) return user;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError("Invalid form data", 400);
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return jsonError("No file provided", 400);
  }
  if (file.size > 4 * 1024 * 1024) {
    return jsonError("Photo must be under 4 MB", 400);
  }

  try {
    const stored = await saveUpload(file);
    return jsonOk({ photo: stored });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Upload failed", 400);
  }
}

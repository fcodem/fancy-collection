import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireOwner, isResponse } from "@/lib/api";
import { bulkImportCustomers } from "@/lib/services/customersOps";

export async function POST(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof Blob)) {
      return jsonError("No file uploaded", 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = (file as File).name || "upload";
    const result = await bulkImportCustomers(buffer, fileName, user.username);
    return jsonOk(result);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Bulk import failed", 500);
  }
}

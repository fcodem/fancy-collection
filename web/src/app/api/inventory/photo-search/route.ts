import { NextRequest } from "next/server";
import { photoSearchInventory } from "@/lib/services/inventoryOps";
import { jsonError, jsonOk, requireUser, isResponse } from "@/lib/api";

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const form = await req.formData();
  const photo = form.get("photo");
  if (!photo || !(photo instanceof File)) return jsonError("No photo uploaded", 400);
  const category = (form.get("category") as string) || "";
  try {
    const buffer = Buffer.from(await photo.arrayBuffer());
    const result = await photoSearchInventory(buffer, category);
    return jsonOk(result);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Search failed", 500);
  }
}

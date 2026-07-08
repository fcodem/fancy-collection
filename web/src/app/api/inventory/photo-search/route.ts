import { NextRequest } from "next/server";
import { photoSearchInventory } from "@/lib/services/inventoryOps";
import { validatePhotoUpload, type SiglipSearchFilters } from "@/lib/services/siglipSearch";
import { isDressCheckerDebugEnabled } from "@/lib/dressCheckerDebug";
import { jsonError, jsonOk, requireUser, isResponse } from "@/lib/api";

function parseFilters(form: FormData): SiglipSearchFilters {
  const minRaw = form.get("min_price");
  const maxRaw = form.get("max_price");
  const gender = (form.get("gender") as string) || "";
  return {
    category: (form.get("category") as string) || "",
    size: (form.get("size") as string) || "",
    color: (form.get("color") as string) || "",
    gender: gender === "mens" || gender === "womens" ? gender : "",
    status: (form.get("status") as string) || "",
    designer: (form.get("designer") as string) || "",
    minPrice: minRaw ? Number(minRaw) : undefined,
    maxPrice: maxRaw ? Number(maxRaw) : undefined,
  };
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const form = await req.formData();
  const photo = form.get("photo");
  if (!photo || !(photo instanceof File)) return jsonError("No photo uploaded", 400);

  const debug = isDressCheckerDebugEnabled(
    form.get("debug") === "1" || req.nextUrl.searchParams.get("debug") === "1",
  );

  try {
    const buffer = Buffer.from(await photo.arrayBuffer());
    const validationError = validatePhotoUpload(photo, buffer);
    if (validationError) return jsonError(validationError, 400);

    const filters = parseFilters(form);
    const result = await photoSearchInventory(buffer, filters, {
      debug,
      mime: photo.type,
    });
    return jsonOk(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Search failed";
    console.error("[DressSearch] photo-search error:", e);
    return jsonError(message, 500);
  }
}

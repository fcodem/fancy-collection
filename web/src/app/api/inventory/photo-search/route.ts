import { NextRequest } from "next/server";
import {
  photoSearchInventory,
  type InventoryPhotoSearchFilters,
} from "@/lib/services/inventoryPhotoSearch";
import { isDressCheckerDebugEnabled } from "@/lib/dressCheckerDebug";
import { jsonError, jsonOk, requireUser, isResponse } from "@/lib/api";
import { enforceRateLimit } from "@/lib/rateLimit";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

function parseFilters(form: FormData): InventoryPhotoSearchFilters {
  const minRaw = form.get("min_price");
  const maxRaw = form.get("max_price");
  const gender = (form.get("gender") as string) || "";
  const modeRaw = String(form.get("mode") || "MANUAL").toUpperCase();
  const mode =
    modeRaw === "AUTO" || modeRaw === "ALL" || modeRaw === "MANUAL"
      ? (modeRaw as InventoryPhotoSearchFilters["mode"])
      : "MANUAL";
  return {
    category: (form.get("category") as string) || "",
    subCategory: (form.get("sub_category") as string) || (form.get("subCategory") as string) || "",
    mode,
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
  const rateKey = `${user.username}:${req.headers.get("x-forwarded-for") || "local"}:inventory-photo-search`;
  const rate = enforceRateLimit(rateKey, 20, 60_000);
  if (!rate.allowed) {
    return jsonError("Too many AI search requests. Please retry shortly.", 429);
  }
  const form = await req.formData();
  const photo = form.get("photo");
  if (!photo || !(photo instanceof File)) return jsonError("No photo uploaded", 400);

  const debug = isDressCheckerDebugEnabled(
    form.get("debug") === "1" || req.nextUrl.searchParams.get("debug") === "1",
  );

  try {
    const buffer = Buffer.from(await photo.arrayBuffer());
    if (buffer.length === 0) return jsonError("Uploaded photo is empty", 400);
    if (buffer.length > 10 * 1024 * 1024) return jsonError("Photo too large (max 10MB)", 400);
    if (!photo.type.startsWith("image/")) return jsonError("Invalid image type", 400);

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

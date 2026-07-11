import { NextRequest } from "next/server";
import { isResponse, jsonError, jsonOk, requireOwner } from "@/lib/api";
import { photoSearchInventory } from "@/lib/services/inventoryOps";
import { getDressCheckerSearchHealth } from "@/lib/dressChecker/searchHealth";
import { enforceRateLimit } from "@/lib/rateLimit";

export async function GET() {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  const searchHealth = await getDressCheckerSearchHealth();
  return jsonOk({ searchHealth });
}

export async function POST(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  const rate = enforceRateLimit(
    `${user.username}:${req.headers.get("x-forwarded-for") || "local"}:recognition-diagnostics`,
    30,
    60_000,
  );
  if (!rate.allowed) return jsonError("Diagnostics rate limit exceeded", 429);
  const form = await req.formData();
  const photo = form.get("photo");
  if (!(photo instanceof File)) return jsonError("photo is required", 400);
  const category = String(form.get("category") || "");

  const buffer = Buffer.from(await photo.arrayBuffer());
  const [searchHealth, result] = await Promise.all([
    getDressCheckerSearchHealth(),
    photoSearchInventory(buffer, { category }, { debug: true }),
  ]);
  return jsonOk({ searchHealth, ...result });
}

import { mkdir, writeFile, access } from "fs/promises";
import { join } from "path";
import { readFileSync, existsSync } from "fs";
import { NextRequest } from "next/server";
import OpenAI from "openai";
import prisma from "@/lib/prisma";
import { jsonError, jsonOk, requireOwner, isResponse } from "@/lib/api";
import { resolveOpenAiKey, maskApiKey } from "@/lib/ai/aiRuntimeSettings";
import { enhanceInventoryImage } from "@/lib/ai/openaiVision";
import { saveEnhancedImage, verifyEnhancedPath } from "@/lib/ai/enhancementStorage";
import { checkEnhancementSchema, ensureEnhancementSchema } from "@/lib/ai/ensureEnhancementSchema";
import { getAiQueueSnapshot } from "@/lib/inventoryAiProfile/queue";
import { catalogPhotoRef } from "@/lib/catalogPhotoRef";

async function checkStorageWritable(): Promise<{ ok: boolean; detail: string }> {
  try {
    const dir = join(process.cwd(), "public", "uploads", "enhanced", "_health");
    await mkdir(dir, { recursive: true });
    const probe = join(dir, "probe.txt");
    await writeFile(probe, "ok");
    await access(probe);
    return { ok: true, detail: dir };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "storage not writable" };
  }
}

async function checkDatabaseWritable(): Promise<{ ok: boolean; detail: string }> {
  try {
    const row = await prisma.aiRuntimeSetting.findUnique({ where: { key: "health_probe" } });
    void row;
    await prisma.aiRuntimeSetting.upsert({
      where: { key: "health_probe" },
      create: { key: "health_probe", value: JSON.stringify({ ts: Date.now() }), updatedBy: "ai-health" },
      update: { value: JSON.stringify({ ts: Date.now() }), updatedBy: "ai-health" },
    });
    return { ok: true, detail: "ai_runtime_settings writable" };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "database write failed" };
  }
}

function checkPrismaClient(): { ok: boolean; detail: string } {
  try {
    const schemaPath = join(process.cwd(), "node_modules", ".prisma", "client", "schema.prisma");
    if (!existsSync(schemaPath)) {
      return { ok: false, detail: "Prisma client not generated — run: npx prisma generate" };
    }
    const schema = readFileSync(schemaPath, "utf8");
    const hasField = schema.includes("enhancedPhoto");
    return {
      ok: hasField,
      detail: hasField
        ? "Prisma client includes enhancedPhoto"
        : "Prisma client stale — run: npx prisma generate",
    };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "client check failed" };
  }
}

async function checkOpenAiReachable(): Promise<{ ok: boolean; detail: string; maskedKey?: string }> {
  try {
    const key = await resolveOpenAiKey();
    const client = new OpenAI({ apiKey: key, timeout: 15000, maxRetries: 0 });
    await client.models.list();
    return { ok: true, detail: "OpenAI API reachable", maskedKey: maskApiKey(key) };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : "OpenAI unreachable",
    };
  }
}

async function checkEnhancementRoundTrip(): Promise<{ ok: boolean; detail: string; path?: string }> {
  try {
    const tinyPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const result = await enhanceInventoryImage(tinyPng, "Minimal clean studio", 0);
    const saved = await saveEnhancedImage(0, result.enhancedBuffer);
    const verify = verifyEnhancedPath(saved.path);
    return {
      ok: verify.ok,
      detail: verify.ok ? "Enhancement round-trip succeeded" : verify.reason || "verify failed",
      path: saved.path,
    };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "Enhancement round-trip failed" };
  }
}

export async function GET(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const applySchema = req.nextUrl.searchParams.get("applySchema") === "1";
  const schemaBefore = await checkEnhancementSchema();
  const schemaApplied = applySchema && !schemaBefore.ok ? await ensureEnhancementSchema() : null;

  const [
    apiKeyCheck,
    openAiCheck,
    storageCheck,
    dbCheck,
    prismaClientCheck,
    enhancementCheck,
    queue,
  ] = await Promise.all([
    resolveOpenAiKey()
      .then((key) => ({ ok: true, detail: "API key configured", maskedKey: maskApiKey(key) }))
      .catch((err) => ({
        ok: false,
        detail: err instanceof Error ? err.message : "API key missing",
      })),
    checkOpenAiReachable(),
    checkStorageWritable(),
    checkDatabaseWritable(),
    Promise.resolve(checkPrismaClient()),
    checkEnhancementRoundTrip(),
    Promise.resolve(getAiQueueSnapshot()),
  ]);

  const schemaAfter = await checkEnhancementSchema();

  const recentFailures = await prisma.inventoryAiProfileLog.findMany({
    where: { event: { in: ["enhancement_failed", "failed"] } },
    orderBy: { id: "desc" },
    take: 5,
    select: { itemId: true, event: true, message: true, createdAt: true },
  });

  const recentEnhanced = await prisma.clothingItem
    .findMany({
      where: { enhancedPhoto: { not: null } },
      orderBy: { enhancementUpdatedAt: "desc" },
      take: 3,
      select: {
        id: true,
        name: true,
        photo: true,
        enhancedPhoto: true,
        enhancementStatus: true,
      },
    })
    .catch(() => [] as Array<{
      id: number;
      name: string;
      photo: string | null;
      enhancedPhoto: string | null;
      enhancementStatus: string;
    }>);

  const catalogChecks = recentEnhanced.map((item) => {
    const ref = catalogPhotoRef(item);
    const verify = verifyEnhancedPath(item.enhancedPhoto);
    return {
      itemId: item.id,
      catalogPhotoRef: ref,
      usesEnhanced: ref === item.enhancedPhoto,
      fileOk: verify.ok,
    };
  });

  const checks = {
    apiKey: apiKeyCheck,
    openAi: openAiCheck,
    storage: storageCheck,
    database: dbCheck,
    prismaClient: prismaClientCheck,
    schema: schemaAfter,
    enhancement: enhancementCheck,
    pipeline: { ok: queue.pending >= 0, detail: "Queue operational", queue },
    catalogPhotoUrl: {
      ok: catalogChecks.every((c) => c.usesEnhanced || c.fileOk),
      samples: catalogChecks,
    },
  };

  const allOk = Object.values(checks).every((c) => {
    if ("ok" in c && typeof c.ok === "boolean") return c.ok;
    return true;
  });

  return jsonOk({
    ok: allOk,
    timestamp: new Date().toISOString(),
    schemaApplied,
    recentFailures,
    checks,
    recommendations: [
      !schemaAfter.ok ? "Run GET /api/admin/ai-health?applySchema=1 or npx prisma migrate deploy" : null,
      !prismaClientCheck.ok ? "Run npx prisma generate (stop dev server first if EPERM)" : null,
      !apiKeyCheck.ok ? "Set OPENAI_API_KEY in .env.local or Admin → AI Settings" : null,
    ].filter(Boolean),
  });
}

export async function POST(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const body = await req.json().catch(() => ({}));
  const itemId = Number(body.itemId);
  if (!itemId) return jsonError("itemId required", 400);

  const item = await prisma.clothingItem.findUnique({
    where: { id: itemId },
    select: { id: true, photo: true, category: true, itemType: true, enhancementStatus: true },
  });
  if (!item) return jsonError("Item not found", 404);

  const { runInventoryImageEnhancement } = await import("@/lib/ai/enhancementPipeline");
  const result = await runInventoryImageEnhancement(itemId, item, "health_check_manual");

  const reloaded = await prisma.clothingItem.findUnique({
    where: { id: itemId },
    select: { enhancedPhoto: true, enhancementStatus: true, enhancementError: true, photo: true },
  });

  return jsonOk({
    result,
    reloaded,
    catalogPhotoRef: reloaded ? catalogPhotoRef(reloaded) : "",
    fileVerify: verifyEnhancedPath(reloaded?.enhancedPhoto),
  });
}

import prisma from "@/lib/prisma";

const REQUIRED_COLUMNS: Array<{ table: string; column: string; ddl: string }> = [
  // Pipeline 1 — original upload
  {
    table: "clothing_items",
    column: "original_photo",
    ddl: `ALTER TABLE "clothing_items" ADD COLUMN IF NOT EXISTS "original_photo" TEXT`,
  },
  // Pipeline 2 — strict preservation enhancement
  {
    table: "clothing_items",
    column: "enhanced_photo",
    ddl: `ALTER TABLE "clothing_items" ADD COLUMN IF NOT EXISTS "enhanced_photo" TEXT`,
  },
  // Pipeline 3 — marketing/creative
  {
    table: "clothing_items",
    column: "marketing_photo",
    ddl: `ALTER TABLE "clothing_items" ADD COLUMN IF NOT EXISTS "marketing_photo" TEXT`,
  },
  {
    table: "clothing_items",
    column: "enhancement_status",
    ddl: `ALTER TABLE "clothing_items" ADD COLUMN IF NOT EXISTS "enhancement_status" TEXT NOT NULL DEFAULT 'none'`,
  },
  {
    table: "clothing_items",
    column: "enhancement_error",
    ddl: `ALTER TABLE "clothing_items" ADD COLUMN IF NOT EXISTS "enhancement_error" TEXT`,
  },
  {
    table: "clothing_items",
    column: "enhancement_version",
    ddl: `ALTER TABLE "clothing_items" ADD COLUMN IF NOT EXISTS "enhancement_version" INTEGER NOT NULL DEFAULT 0`,
  },
  {
    table: "clothing_items",
    column: "enhancement_model",
    ddl: `ALTER TABLE "clothing_items" ADD COLUMN IF NOT EXISTS "enhancement_model" TEXT`,
  },
  {
    table: "clothing_items",
    column: "enhancement_latency",
    ddl: `ALTER TABLE "clothing_items" ADD COLUMN IF NOT EXISTS "enhancement_latency" INTEGER`,
  },
  {
    table: "clothing_items",
    column: "enhancement_started_at",
    ddl: `ALTER TABLE "clothing_items" ADD COLUMN IF NOT EXISTS "enhancement_started_at" TIMESTAMPTZ`,
  },
  {
    table: "clothing_items",
    column: "enhancement_completed_at",
    ddl: `ALTER TABLE "clothing_items" ADD COLUMN IF NOT EXISTS "enhancement_completed_at" TIMESTAMPTZ`,
  },
  {
    table: "clothing_items",
    column: "last_enhanced_at",
    ddl: `ALTER TABLE "clothing_items" ADD COLUMN IF NOT EXISTS "last_enhanced_at" TIMESTAMPTZ`,
  },
  {
    table: "clothing_items",
    column: "enhancement_updated_at",
    ddl: `ALTER TABLE "clothing_items" ADD COLUMN IF NOT EXISTS "enhancement_updated_at" TIMESTAMP(3)`,
  },
  {
    table: "inventory_ai_profiles",
    column: "enhanced_image",
    ddl: `ALTER TABLE "inventory_ai_profiles" ADD COLUMN IF NOT EXISTS "enhanced_image" TEXT`,
  },
  {
    table: "inventory_ai_profiles",
    column: "enhancement_status",
    ddl: `ALTER TABLE "inventory_ai_profiles" ADD COLUMN IF NOT EXISTS "enhancement_status" TEXT NOT NULL DEFAULT 'none'`,
  },
  {
    table: "inventory_ai_profiles",
    column: "enhancement_error",
    ddl: `ALTER TABLE "inventory_ai_profiles" ADD COLUMN IF NOT EXISTS "enhancement_error" TEXT`,
  },
  {
    table: "inventory_ai_profiles",
    column: "prompt_version",
    ddl: `ALTER TABLE "inventory_ai_profiles" ADD COLUMN IF NOT EXISTS "prompt_version" TEXT`,
  },
  {
    table: "inventory_ai_profiles",
    column: "ai_version",
    ddl: `ALTER TABLE "inventory_ai_profiles" ADD COLUMN IF NOT EXISTS "ai_version" TEXT`,
  },
];

export async function checkEnhancementSchema(): Promise<{
  ok: boolean;
  missing: string[];
}> {
  const missing: string[] = [];
  for (const col of REQUIRED_COLUMNS) {
    const rows = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = $1 AND column_name = $2
       ) AS exists`,
      col.table,
      col.column,
    );
    if (!rows[0]?.exists) {
      missing.push(`${col.table}.${col.column}`);
    }
  }
  return { ok: missing.length === 0, missing };
}

export async function ensureEnhancementSchema(): Promise<{ applied: string[]; missing: string[] }> {
  const before = await checkEnhancementSchema();
  if (before.ok) return { applied: [], missing: [] };

  const applied: string[] = [];
  for (const col of REQUIRED_COLUMNS) {
    if (!before.missing.includes(`${col.table}.${col.column}`)) continue;
    await prisma.$executeRawUnsafe(col.ddl);
    applied.push(`${col.table}.${col.column}`);
  }

  // Backfill original_photo from photo for any existing items that don't have it.
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE clothing_items SET original_photo = photo WHERE original_photo IS NULL AND photo IS NOT NULL AND photo <> ''`,
    );
  } catch {
    // non-critical
  }

  // pgvector is optional for enhancement; try once without failing the pipeline.
  try {
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector`);
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "inventory_ai_profiles" ADD COLUMN IF NOT EXISTS "embedding_vector" vector(3072)`,
    );
  } catch {
    // enhancement does not require pgvector
  }

  const after = await checkEnhancementSchema();
  return { applied, missing: after.missing };
}

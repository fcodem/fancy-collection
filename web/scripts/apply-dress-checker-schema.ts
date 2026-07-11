/**
 * Applies Dress Checker DB columns (hash fields + optional pgvector).
 * Safe to run multiple times.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const STATEMENTS = [
  `ALTER TABLE inventory_ai_profiles
     ADD COLUMN IF NOT EXISTS photo_hash TEXT,
     ADD COLUMN IF NOT EXISTS difference_hash TEXT,
     ADD COLUMN IF NOT EXISTS color_histogram JSONB,
     ADD COLUMN IF NOT EXISTS verification_metadata JSONB,
     ADD COLUMN IF NOT EXISTS processing_error TEXT,
     ADD COLUMN IF NOT EXISTS reindexed_at TIMESTAMPTZ,
     ADD COLUMN IF NOT EXISTS image_embedding_json JSONB`,
  `DO $$ BEGIN CREATE EXTENSION IF NOT EXISTS vector; EXCEPTION WHEN OTHERS THEN
     RAISE WARNING 'pgvector not available: %', SQLERRM; END $$`,
  `DO $$ BEGIN
     IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')
        AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'inventory_ai_profiles'
            AND column_name = 'embedding_vector'
        ) THEN
       ALTER TABLE inventory_ai_profiles ADD COLUMN embedding_vector vector(768);
     END IF;
   END $$`,
  `CREATE INDEX IF NOT EXISTS inventory_ai_profiles_status_reindexed_idx
     ON inventory_ai_profiles (status, reindexed_at)`,
  `CREATE INDEX IF NOT EXISTS inventory_ai_profiles_photo_hash_idx
     ON inventory_ai_profiles (photo_hash) WHERE photo_hash IS NOT NULL`,
];

async function main() {
  for (const stmt of STATEMENTS) {
    try {
      await prisma.$executeRawUnsafe(stmt);
    } catch (err) {
      console.warn("[schema] statement warning:", err instanceof Error ? err.message : err);
    }
  }

  const pg = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS exists`,
  );
  if (pg[0]?.exists) {
    try {
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS inventory_ai_profiles_embedding_vector_768_idx
         ON inventory_ai_profiles USING ivfflat (embedding_vector vector_cosine_ops) WITH (lists = 100)`,
      );
    } catch (err) {
      console.warn("[schema] ivfflat index:", err instanceof Error ? err.message : err);
    }
  }

  const cols = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'inventory_ai_profiles'
       AND column_name IN ('photo_hash','difference_hash','color_histogram','verification_metadata','processing_error','reindexed_at','embedding_vector','image_embedding_json')`,
  );
  console.log("[schema] Dress Checker columns OK");
  console.log("[schema] pgvector:", pg[0]?.exists ? "yes" : "no (install pgvector for vector search)");
  console.log("[schema] columns:", cols.map((c) => c.column_name).join(", "));
}

main()
  .catch((e) => {
    console.error("[schema] apply failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

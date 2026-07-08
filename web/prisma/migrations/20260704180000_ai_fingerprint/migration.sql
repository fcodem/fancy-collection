-- AlterTable: replace embedding fields with AI fingerprint
ALTER TABLE "clothing_items" DROP COLUMN IF EXISTS "ai_description";
ALTER TABLE "clothing_items" DROP COLUMN IF EXISTS "ai_embedding";
ALTER TABLE "clothing_items" DROP COLUMN IF EXISTS "ai_described_at";
ALTER TABLE "clothing_items" ADD COLUMN "ai_fingerprint" TEXT;
ALTER TABLE "clothing_items" ADD COLUMN "ai_indexed_at" TIMESTAMP(3);

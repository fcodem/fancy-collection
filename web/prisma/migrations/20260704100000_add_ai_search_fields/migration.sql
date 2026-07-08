-- AlterTable
ALTER TABLE "clothing_items" ADD COLUMN "ai_description" TEXT,
ADD COLUMN "ai_embedding" TEXT,
ADD COLUMN "ai_described_at" TIMESTAMP(3);

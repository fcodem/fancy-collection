-- AlterTable: SigLIP visual search embeddings (JSON array, no pgvector)
ALTER TABLE "clothing_items" ADD COLUMN IF NOT EXISTS "siglip_embedding" JSONB;
ALTER TABLE "clothing_items" ADD COLUMN IF NOT EXISTS "siglip_indexed_at" TIMESTAMP(3);

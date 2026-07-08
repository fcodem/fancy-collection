-- Extend InventoryAiProfile with recognition pipeline fields
ALTER TABLE "inventory_ai_profiles" ADD COLUMN "recognition_image" TEXT;
ALTER TABLE "inventory_ai_profiles" ADD COLUMN "recognition_fingerprint" JSONB;
ALTER TABLE "inventory_ai_profiles" ADD COLUMN "recognition_version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "inventory_ai_profiles" ADD COLUMN "model_version" TEXT;
ALTER TABLE "inventory_ai_profiles" ADD COLUMN "quality_score" DOUBLE PRECISION;
ALTER TABLE "inventory_ai_profiles" ADD COLUMN "last_processed" TIMESTAMP(3);

-- Extend dress checker corrections for hybrid feedback
ALTER TABLE "dress_checker_corrections" ADD COLUMN "hybrid_score" DOUBLE PRECISION;
ALTER TABLE "dress_checker_corrections" ADD COLUMN "feature_comparison" JSONB;
ALTER TABLE "dress_checker_corrections" ADD COLUMN "feedback_type" TEXT NOT NULL DEFAULT 'positive';
ALTER TABLE "dress_checker_corrections" ADD COLUMN "rejected_item_id" INTEGER;

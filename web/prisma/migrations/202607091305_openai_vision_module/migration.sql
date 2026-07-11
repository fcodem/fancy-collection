-- OpenAI Vision/Image module storage
ALTER TABLE "clothing_items"
  ADD COLUMN IF NOT EXISTS "enhanced_photo" TEXT,
  ADD COLUMN IF NOT EXISTS "enhancement_status" TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS "enhancement_error" TEXT,
  ADD COLUMN IF NOT EXISTS "enhancement_version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "enhancement_updated_at" TIMESTAMP(3);

ALTER TABLE "inventory_ai_profiles"
  ADD COLUMN IF NOT EXISTS "enhanced_image" TEXT,
  ADD COLUMN IF NOT EXISTS "enhancement_status" TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS "enhancement_error" TEXT,
  ADD COLUMN IF NOT EXISTS "enhancement_version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "enhancement_model" TEXT,
  ADD COLUMN IF NOT EXISTS "enhancement_latency_ms" INTEGER;

ALTER TABLE "inventory_ai_profile_versions"
  ADD COLUMN IF NOT EXISTS "enhanced_image" TEXT,
  ADD COLUMN IF NOT EXISTS "enhancement_status" TEXT,
  ADD COLUMN IF NOT EXISTS "enhancement_model" TEXT;

CREATE TABLE IF NOT EXISTS "ai_runtime_settings" (
  "key" TEXT NOT NULL,
  "value" TEXT,
  "encrypted" BOOLEAN NOT NULL DEFAULT false,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "updated_by" TEXT,
  CONSTRAINT "ai_runtime_settings_pkey" PRIMARY KEY ("key")
);

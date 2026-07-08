-- Enterprise AI Inventory Profile tables

CREATE TABLE "inventory_ai_profiles" (
    "item_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'none',
    "error" TEXT,
    "current_version" INTEGER NOT NULL DEFAULT 0,
    "pipeline_version" TEXT NOT NULL DEFAULT '1',
    "indexed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "search_text" TEXT,
    "colour_analysis" JSONB,
    "garment_attributes" JSONB,
    "jewellery_attributes" JSONB,
    "quality_scores" JSONB,
    "duplicate_fingerprint" JSONB,
    "health_score" DOUBLE PRECISION,
    "health_issues" JSONB,

    CONSTRAINT "inventory_ai_profiles_pkey" PRIMARY KEY ("item_id")
);

CREATE TABLE "inventory_ai_profile_versions" (
    "id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "embedding_model" TEXT,
    "embedding_model_version" TEXT,
    "vision_model" TEXT,
    "pipeline_version" TEXT,
    "embeddings" JSONB,
    "feature_fingerprint" JSONB,
    "duplicate_fingerprint" JSONB,
    "colour_analysis" JSONB,
    "garment_attributes" JSONB,
    "jewellery_attributes" JSONB,
    "quality_scores" JSONB,
    "description" TEXT,
    "tags_snapshot" JSONB,
    "source_images" JSONB,

    CONSTRAINT "inventory_ai_profile_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory_ai_profile_tags" (
    "id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "tag" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'ai',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_ai_profile_tags_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory_ai_profile_overrides" (
    "item_id" INTEGER NOT NULL,
    "description" TEXT,
    "tags" JSONB,
    "colour_analysis" JSONB,
    "garment_attributes" JSONB,
    "jewellery_attributes" JSONB,
    "category" TEXT,
    "sub_category" TEXT,
    "quality_notes" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "inventory_ai_profile_overrides_pkey" PRIMARY KEY ("item_id")
);

CREATE TABLE "inventory_ai_profile_logs" (
    "id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "event" TEXT NOT NULL,
    "message" TEXT,
    "version" INTEGER,
    "model_version" TEXT,
    "duration_ms" INTEGER,
    "retry_count" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_ai_profile_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "inventory_ai_profile_versions_item_id_version_key" ON "inventory_ai_profile_versions"("item_id", "version");
CREATE INDEX "inventory_ai_profile_versions_item_id_idx" ON "inventory_ai_profile_versions"("item_id");

CREATE UNIQUE INDEX "inventory_ai_profile_tags_item_id_tag_source_key" ON "inventory_ai_profile_tags"("item_id", "tag", "source");
CREATE INDEX "inventory_ai_profile_tags_tag_idx" ON "inventory_ai_profile_tags"("tag");
CREATE INDEX "inventory_ai_profile_tags_item_id_idx" ON "inventory_ai_profile_tags"("item_id");

CREATE INDEX "inventory_ai_profiles_status_idx" ON "inventory_ai_profiles"("status");
CREATE INDEX "inventory_ai_profiles_health_score_idx" ON "inventory_ai_profiles"("health_score");

CREATE INDEX "inventory_ai_profile_logs_item_id_idx" ON "inventory_ai_profile_logs"("item_id");
CREATE INDEX "inventory_ai_profile_logs_created_at_idx" ON "inventory_ai_profile_logs"("created_at");
CREATE INDEX "inventory_ai_profile_logs_event_idx" ON "inventory_ai_profile_logs"("event");

ALTER TABLE "inventory_ai_profiles" ADD CONSTRAINT "inventory_ai_profiles_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "clothing_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_ai_profile_versions" ADD CONSTRAINT "inventory_ai_profile_versions_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory_ai_profiles"("item_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_ai_profile_tags" ADD CONSTRAINT "inventory_ai_profile_tags_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory_ai_profiles"("item_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_ai_profile_overrides" ADD CONSTRAINT "inventory_ai_profile_overrides_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory_ai_profiles"("item_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_ai_profile_logs" ADD CONSTRAINT "inventory_ai_profile_logs_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory_ai_profiles"("item_id") ON DELETE CASCADE ON UPDATE CASCADE;

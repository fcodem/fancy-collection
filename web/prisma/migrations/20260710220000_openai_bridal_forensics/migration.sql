-- Enterprise OpenAI integration: permanent bridal fingerprints, audit, learning pairs

CREATE TABLE IF NOT EXISTS "inventory_ai_fingerprints" (
  "item_id" INTEGER PRIMARY KEY REFERENCES "clothing_items"("id") ON DELETE CASCADE,
  "primary_color" TEXT,
  "secondary_colors" JSONB,
  "color_families" JSONB,
  "embroidery_density" TEXT,
  "embroidery_style" TEXT,
  "motifs" JSONB,
  "motif_count" INTEGER DEFAULT 0,
  "motif_positions" JSONB,
  "panel_count" INTEGER DEFAULT 0,
  "panel_sequence" JSONB,
  "border_type" TEXT,
  "border_patterns" JSONB,
  "blouse_style" TEXT,
  "dupatta_style" TEXT,
  "silhouette" TEXT,
  "unique_identifiers" JSONB,
  "stone_work" BOOLEAN DEFAULT false,
  "mirror_work" BOOLEAN DEFAULT false,
  "zari_work" BOOLEAN DEFAULT false,
  "thread_work" BOOLEAN DEFAULT false,
  "confidence" DOUBLE PRECISION,
  "gpt_description" TEXT,
  "raw_json" JSONB,
  "model" TEXT,
  "prompt_version" TEXT DEFAULT 'bridal_fp_v1',
  "extracted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "dress_search_audits" (
  "id" SERIAL PRIMARY KEY,
  "search_id" TEXT NOT NULL,
  "query_image" TEXT,
  "query_type" TEXT,
  "query_type_confidence" DOUBLE PRECISION,
  "candidate_ids" JSONB,
  "embeddings_meta" JSONB,
  "fingerprints_meta" JSONB,
  "gpt_prompt" TEXT,
  "gpt_response" JSONB,
  "gpt_called" BOOLEAN DEFAULT false,
  "gpt_skip_reason" TEXT,
  "stage_timings" JSONB,
  "final_decision" JSONB,
  "final_item_id" INTEGER,
  "final_score" DOUBLE PRECISION,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "dress_search_audits_search_id_idx" ON "dress_search_audits"("search_id");
CREATE INDEX IF NOT EXISTS "dress_search_audits_created_at_idx" ON "dress_search_audits"("created_at");

CREATE TABLE IF NOT EXISTS "dress_negative_pairs" (
  "id" SERIAL PRIMARY KEY,
  "query_item_id" INTEGER,
  "rejected_item_id" INTEGER NOT NULL REFERENCES "clothing_items"("id") ON DELETE CASCADE,
  "query_photo" TEXT,
  "reason" TEXT,
  "source" TEXT NOT NULL DEFAULT 'admin_reject',
  "confirmed_by" TEXT,
  "search_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "dress_negative_pairs_rejected_idx" ON "dress_negative_pairs"("rejected_item_id");
CREATE INDEX IF NOT EXISTS "dress_negative_pairs_created_at_idx" ON "dress_negative_pairs"("created_at");

CREATE TABLE IF NOT EXISTS "dress_admin_feedback" (
  "id" SERIAL PRIMARY KEY,
  "item_id" INTEGER REFERENCES "clothing_items"("id") ON DELETE SET NULL,
  "search_id" TEXT,
  "feedback" TEXT NOT NULL,
  "notes" TEXT,
  "query_photo" TEXT,
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "dress_admin_feedback_item_id_idx" ON "dress_admin_feedback"("item_id");
CREATE INDEX IF NOT EXISTS "dress_admin_feedback_created_at_idx" ON "dress_admin_feedback"("created_at");

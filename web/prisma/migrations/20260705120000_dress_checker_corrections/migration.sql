CREATE TABLE IF NOT EXISTS "dress_checker_corrections" (
    "id" SERIAL NOT NULL,
    "correct_item_id" INTEGER NOT NULL,
    "predicted_item_id" INTEGER,
    "predicted_sku" TEXT,
    "confidence" DOUBLE PRECISION,
    "uploaded_photo" TEXT NOT NULL,
    "corrected_by" TEXT,
    "search_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dress_checker_corrections_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "dress_checker_corrections_correct_item_id_idx" ON "dress_checker_corrections"("correct_item_id");
CREATE INDEX IF NOT EXISTS "dress_checker_corrections_created_at_idx" ON "dress_checker_corrections"("created_at");

DO $$ BEGIN
  ALTER TABLE "dress_checker_corrections" ADD CONSTRAINT "dress_checker_corrections_correct_item_id_fkey" FOREIGN KEY ("correct_item_id") REFERENCES "clothing_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "dress_checker_corrections" ADD CONSTRAINT "dress_checker_corrections_predicted_item_id_fkey" FOREIGN KEY ("predicted_item_id") REFERENCES "clothing_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

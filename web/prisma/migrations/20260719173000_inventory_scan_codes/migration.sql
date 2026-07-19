-- Additive mapping of QR/barcode aliases to one physical clothing_items row.
-- Existing inventory is intentionally left unchanged; backfill is an explicit operator action.
CREATE TABLE IF NOT EXISTS "inventory_scan_codes" (
  "id" SERIAL NOT NULL,
  "inventory_id" INTEGER NOT NULL,
  "code" TEXT NOT NULL,
  "normalized_code" TEXT NOT NULL,
  "format" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "inventory_scan_codes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_scan_codes_inventory_id_fkey"
    FOREIGN KEY ("inventory_id") REFERENCES "clothing_items"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "inventory_scan_codes_normalized_code_key"
  ON "inventory_scan_codes"("normalized_code");
CREATE INDEX IF NOT EXISTS "inventory_scan_codes_inventory_id_active_idx"
  ON "inventory_scan_codes"("inventory_id", "active");
CREATE INDEX IF NOT EXISTS "inventory_scan_codes_inventory_id_is_primary_idx"
  ON "inventory_scan_codes"("inventory_id", "is_primary");

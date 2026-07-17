-- Additive: link inventory variants created in one save.

ALTER TABLE "clothing_items" ADD COLUMN IF NOT EXISTS "inventory_group_id" TEXT;
CREATE INDEX IF NOT EXISTS "clothing_items_inventory_group_id_idx"
  ON "clothing_items"("inventory_group_id");

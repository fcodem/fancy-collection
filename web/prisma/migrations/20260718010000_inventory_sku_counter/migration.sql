-- Additive: concurrency-safe inventory SKU allocator.
-- Seeded from existing max clothing_items.id so new SKUs stay ahead of legacy ITM-####.

CREATE TABLE IF NOT EXISTS "inventory_sku_counter" (
  "id" INTEGER PRIMARY KEY DEFAULT 1 CHECK ("id" = 1),
  "next_value" BIGINT NOT NULL DEFAULT 1
);

INSERT INTO "inventory_sku_counter" ("id", "next_value")
SELECT 1, GREATEST(COALESCE((SELECT MAX(id) FROM clothing_items), 0) + 1, 1)
WHERE NOT EXISTS (SELECT 1 FROM "inventory_sku_counter" WHERE "id" = 1);

-- Keep counter ahead of any existing ITM-#### numeric suffixes when higher than max(id)
UPDATE "inventory_sku_counter"
SET "next_value" = GREATEST(
  "next_value",
  COALESCE(
    (
      SELECT MAX(NULLIF(regexp_replace(sku, '^ITM-', ''), '')::bigint)
      FROM clothing_items
      WHERE sku ~ '^ITM-[0-9]+$'
    ),
    0
  ) + 1
)
WHERE "id" = 1;

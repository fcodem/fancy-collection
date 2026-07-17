-- Additive search indexes for inventory list/suggest (staging EXPLAIN recommended before prod).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS clothing_items_name_trgm_idx
  ON clothing_items USING gin (lower(name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS clothing_items_sku_trgm_idx
  ON clothing_items USING gin (lower(sku) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS clothing_items_notes_trgm_idx
  ON clothing_items USING gin (lower(coalesce(condition_notes, '')) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS clothing_items_category_status_name_id_idx
  ON clothing_items (category, status, name, id);

CREATE INDEX IF NOT EXISTS clothing_items_status_name_id_idx
  ON clothing_items (status, name, id);

CREATE INDEX IF NOT EXISTS clothing_items_created_at_id_idx
  ON clothing_items (created_at, id);

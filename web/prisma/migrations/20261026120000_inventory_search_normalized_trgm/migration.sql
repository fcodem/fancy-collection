-- Trigram indexes for the normalised name/SKU/colour expressions used by
-- inventorySearch.ts and inventoryMatchSql.ts. Expressions must stay textually
-- identical to the query expressions or the planner cannot use them.
-- Indexes only: no table, column or row is changed.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS clothing_items_name_raw_trgm_idx
  ON clothing_items USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS clothing_items_color_lower_trgm_idx
  ON clothing_items USING gin (lower(coalesce(color, '')) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS clothing_items_color_trgm_idx
  ON clothing_items USING gin (coalesce(color, '') gin_trgm_ops);

CREATE INDEX IF NOT EXISTS clothing_items_notes_raw_trgm_idx
  ON clothing_items USING gin (coalesce(condition_notes, '') gin_trgm_ops);

CREATE INDEX IF NOT EXISTS clothing_items_name_base_lower_trgm_idx
  ON clothing_items USING gin (lower(regexp_replace(name, '\s+#\d+$', '')) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS clothing_items_name_compact_trgm_idx
  ON clothing_items USING gin (regexp_replace(lower(name), '[^a-z0-9]', '', 'g') gin_trgm_ops);

CREATE INDEX IF NOT EXISTS clothing_items_name_base_compact_trgm_idx
  ON clothing_items USING gin (regexp_replace(lower(regexp_replace(name, '\s+#\d+$', '')), '[^a-z0-9]', '', 'g') gin_trgm_ops);

CREATE INDEX IF NOT EXISTS clothing_items_sku_compact_trgm_idx
  ON clothing_items USING gin (regexp_replace(lower(sku), '[^a-z0-9]', '', 'g') gin_trgm_ops);

CREATE INDEX IF NOT EXISTS clothing_items_name_color_compact_trgm_idx
  ON clothing_items USING gin (regexp_replace(lower(name || ' ' || coalesce(color, '')), '[^a-z0-9]', '', 'g') gin_trgm_ops);

CREATE INDEX IF NOT EXISTS clothing_items_color_compact_trgm_idx
  ON clothing_items USING gin (regexp_replace(lower(coalesce(color, '')), '[^a-z0-9]', '', 'g') gin_trgm_ops);

CREATE INDEX IF NOT EXISTS clothing_items_notes_compact_trgm_idx
  ON clothing_items USING gin (regexp_replace(lower(coalesce(condition_notes, '')), '[^a-z0-9]', '', 'g') gin_trgm_ops);

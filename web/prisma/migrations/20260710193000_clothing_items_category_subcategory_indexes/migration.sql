-- Category-aware Dress Checker search indexes
CREATE INDEX IF NOT EXISTS clothing_items_category_idx
  ON clothing_items (category);

CREATE INDEX IF NOT EXISTS clothing_items_sub_category_idx
  ON clothing_items (sub_category);

CREATE INDEX IF NOT EXISTS clothing_items_category_sub_category_idx
  ON clothing_items (category, sub_category);

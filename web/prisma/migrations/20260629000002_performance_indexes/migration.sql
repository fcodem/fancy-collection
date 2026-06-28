-- Inventory availability and list filters
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clothing_items_status
  ON clothing_items (status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clothing_items_category_status
  ON clothing_items (category, status);

-- Customer phone lookup / merge
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_phone
  ON customers (phone);

-- Active / overdue rental queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rentals_status_end_date
  ON rentals (status, end_date);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rentals_customer_id
  ON rentals (customer_id);

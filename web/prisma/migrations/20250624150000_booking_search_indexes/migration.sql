-- Composite indexes for booking search at scale
CREATE INDEX IF NOT EXISTS "bookings_status_delivery_date_idx" ON "bookings"("status", "delivery_date");
CREATE INDEX IF NOT EXISTS "bookings_status_monthly_serial_idx" ON "bookings"("status", "monthly_serial");

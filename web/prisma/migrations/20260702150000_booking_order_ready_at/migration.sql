-- Custom Orders: track when an order is marked ready

ALTER TABLE "booking_orders"
  ADD COLUMN IF NOT EXISTS "ready_at" TIMESTAMP(3);

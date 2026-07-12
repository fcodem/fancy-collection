-- Per-dress cancel on multi-item bookings (refunded vs retained advance).
ALTER TABLE "booking_items" ADD COLUMN IF NOT EXISTS "is_cancelled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "booking_items" ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP(3);
ALTER TABLE "booking_items" ADD COLUMN IF NOT EXISTS "cancel_refund_amount" DOUBLE PRECISION NOT NULL DEFAULT 0;

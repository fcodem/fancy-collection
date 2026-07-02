-- Repair: ensure slip-notification and late-reminder columns exist
-- (safe to re-run; previous migration may have been marked applied without executing)
ALTER TABLE "booking_items" ADD COLUMN IF NOT EXISTS "delivery_slip_notified_at" TIMESTAMP(3);
ALTER TABLE "booking_items" ADD COLUMN IF NOT EXISTS "return_slip_notified_at" TIMESTAMP(3);
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "late_reminder_sent_at" TIMESTAMP(3);

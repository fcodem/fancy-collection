-- AlterTable
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "remaining_payment_mode" TEXT;

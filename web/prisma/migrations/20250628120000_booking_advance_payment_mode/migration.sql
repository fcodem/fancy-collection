-- AlterTable
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "advance_payment_mode" TEXT NOT NULL DEFAULT 'cash';

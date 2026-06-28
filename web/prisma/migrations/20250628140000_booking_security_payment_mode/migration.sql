-- AlterTable
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "security_payment_mode" TEXT;

-- Custom Orders: track cash/online payment mode for the order advance taken at booking

ALTER TABLE "booking_orders"
  ADD COLUMN IF NOT EXISTS "advance_payment_mode" TEXT;

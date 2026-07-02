-- Custom Orders: newly-made items attached to a booking

CREATE TABLE IF NOT EXISTS "booking_orders" (
    "id" SERIAL NOT NULL,
    "booking_id" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "advance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "photo" TEXT,
    "delivery_date" TIMESTAMP(3) NOT NULL,
    "delivery_time" TEXT NOT NULL,
    "balance_collected" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "collected_at" TIMESTAMP(3),
    "collect_payment_mode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "cancelled_at" TIMESTAMP(3),
    "refund_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reminder_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_orders_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "booking_orders_booking_id_idx"
  ON "booking_orders"("booking_id");
CREATE INDEX IF NOT EXISTS "booking_orders_delivery_date_idx"
  ON "booking_orders"("delivery_date");
CREATE INDEX IF NOT EXISTS "booking_orders_status_delivery_date_idx"
  ON "booking_orders"("status", "delivery_date");

DO $$ BEGIN
  ALTER TABLE "booking_orders"
    ADD CONSTRAINT "booking_orders_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

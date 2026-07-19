-- Concurrency-safe monthly booking serial allocator (replaces MAX scan on bookings).

CREATE TABLE IF NOT EXISTS "booking_serial_counter" (
  "year_month" VARCHAR(7) NOT NULL,
  "last_serial" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "booking_serial_counter_pkey" PRIMARY KEY ("year_month")
);

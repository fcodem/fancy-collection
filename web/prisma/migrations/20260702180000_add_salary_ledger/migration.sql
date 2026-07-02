-- Salary Ledger: money / salary advances paid to staff (multiple entries per day allowed)

CREATE TABLE IF NOT EXISTS "salary_ledger" (
    "id" SERIAL NOT NULL,
    "staff_id" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salary_ledger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "salary_ledger_staff_id_date_idx"
  ON "salary_ledger"("staff_id", "date");

DO $$ BEGIN
  ALTER TABLE "salary_ledger"
    ADD CONSTRAINT "salary_ledger_staff_id_fkey"
    FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

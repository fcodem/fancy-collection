-- Ledger expenses: daily/period business expenses logged in the Finance ledger

CREATE TABLE IF NOT EXISTS "ledger_expenses" (
  "id" SERIAL NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "category" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "payment_mode" TEXT NOT NULL DEFAULT 'cash',
  "notes" TEXT,
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ledger_expenses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ledger_expenses_date_idx" ON "ledger_expenses"("date");

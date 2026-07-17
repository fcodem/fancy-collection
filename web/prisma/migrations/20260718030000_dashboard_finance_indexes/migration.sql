-- Additive indexes for dashboard finance aggregates (non-destructive).

CREATE INDEX IF NOT EXISTS "invoices_status_idx" ON "invoices"("status");
CREATE INDEX IF NOT EXISTS "payments_paid_at_idx" ON "payments"("paid_at");

-- Public slip access: random tokens instead of enumerable BK-###### IDs.
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "public_access_token" TEXT;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "public_access_expires_at" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "bookings_public_access_token_key" ON "bookings"("public_access_token");

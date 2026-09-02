-- Multiple delivery dates for shop enquiries (JSON array of ISO dates).
ALTER TABLE "shop_enquiries" ADD COLUMN "delivery_dates" TEXT;

UPDATE "shop_enquiries"
SET "delivery_dates" = json_build_array(to_char("dress_needed_date" AT TIME ZONE 'UTC', 'YYYY-MM-DD'))::text
WHERE "dress_needed_date" IS NOT NULL AND ("delivery_dates" IS NULL OR "delivery_dates" = '');

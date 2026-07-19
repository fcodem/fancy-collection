-- Add optional dress-needed date to shop enquiries.
ALTER TABLE "shop_enquiries" ADD COLUMN "dress_needed_date" TIMESTAMP(3);

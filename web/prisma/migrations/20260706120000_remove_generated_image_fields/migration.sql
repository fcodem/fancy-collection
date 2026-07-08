-- Preserve original uploads before dropping duplicate/generated columns.
UPDATE clothing_items
SET photo = COALESCE(original_photo, photo)
WHERE original_photo IS NOT NULL AND TRIM(original_photo) <> '';

DROP TABLE IF EXISTS inventory_studio_logs;

ALTER TABLE clothing_items DROP COLUMN IF EXISTS original_photo;
ALTER TABLE clothing_items DROP COLUMN IF EXISTS transparent_image;
ALTER TABLE clothing_items DROP COLUMN IF EXISTS showcase_image;
ALTER TABLE clothing_items DROP COLUMN IF EXISTS thumbnail_image;
ALTER TABLE clothing_items DROP COLUMN IF EXISTS booking_slip_image;
ALTER TABLE clothing_items DROP COLUMN IF EXISTS quotation_image;
ALTER TABLE clothing_items DROP COLUMN IF EXISTS whatsapp_image;
ALTER TABLE clothing_items DROP COLUMN IF EXISTS catalogue_image;
ALTER TABLE clothing_items DROP COLUMN IF EXISTS mobile_image;
ALTER TABLE clothing_items DROP COLUMN IF EXISTS studio_processing_status;
ALTER TABLE clothing_items DROP COLUMN IF EXISTS studio_processing_version;
ALTER TABLE clothing_items DROP COLUMN IF EXISTS studio_generated_at;
ALTER TABLE clothing_items DROP COLUMN IF EXISTS studio_processing_error;

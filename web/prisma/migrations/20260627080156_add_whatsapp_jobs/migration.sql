/*
  Warnings:

  - You are about to drop the `whatsapp_message_queue` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "whatsapp_message_queue" DROP CONSTRAINT "whatsapp_message_queue_booking_id_fkey";

-- DropTable
DROP TABLE "whatsapp_message_queue";

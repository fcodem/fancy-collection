import { NextRequest } from "next/server";
import { jsonOk, requireOwner, isResponse } from "@/lib/api";

export async function GET(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  return jsonOk({
    WHATSAPP_ACCESS_TOKEN: !!process.env.WHATSAPP_ACCESS_TOKEN,
    WHATSAPP_PHONE_NUMBER_ID: !!process.env.WHATSAPP_PHONE_NUMBER_ID,
    WHATSAPP_BUSINESS_ACCOUNT_ID: !!process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: !!process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    BLOB_READ_WRITE_TOKEN: !!process.env.BLOB_READ_WRITE_TOKEN,
    BUSINESS_NAME: process.env.BUSINESS_NAME || "NOT SET",
    BUSINESS_PHONE: process.env.BUSINESS_PHONE || "NOT SET",
    BASE_URL: process.env.BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "NOT SET",
    CRON_SECRET: !!process.env.CRON_SECRET,
    NODE_ENV: process.env.NODE_ENV,
  });
}

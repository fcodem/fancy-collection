import { appendFile, mkdir } from "fs/promises";
import path from "path";

const LOG_DIR = path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "whatsapp.log");

export type WhatsAppLogEntry = {
  timestamp?: string;
  bookingId?: number | string;
  publicBookingId?: string;
  step?: string;
  phone?: string;
  campaign?: string;
  success?: boolean;
  messageId?: string;
  error?: string;
  detail?: unknown;
};

/** Append a JSON line to web/logs/whatsapp.log (creates directory if needed). */
export async function logWhatsApp(entry: WhatsAppLogEntry): Promise<void> {
  const line = JSON.stringify({
    timestamp: entry.timestamp ?? new Date().toISOString(),
    ...entry,
  });
  try {
    await mkdir(LOG_DIR, { recursive: true });
    await appendFile(LOG_FILE, `${line}\n`, "utf8");
  } catch (e) {
    console.error("[whatsappLogger] failed to write log:", e);
    console.error("[whatsappLogger]", line);
  }
}

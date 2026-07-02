import prisma from "@/lib/prisma";
import { parseDate, todayIso } from "@/lib/constants";
import { sendLateReturnReminderWhatsApp } from "@/lib/services/whatsapp/automatedMessages";

/**
 * Daily cron: remind customers whose booking is still out (status delivered)
 * and past the return date, once per overdue period (lateReminderSentAt).
 */
export async function sendDailyLateReturnReminders() {
  const todayStr = todayIso();
  const startOfToday = parseDate(todayStr);

  const bookings = await prisma.booking.findMany({
    where: {
      status: "delivered",
      returnDate: { lt: startOfToday },
      lateReminderSentAt: null,
    },
    select: { id: true },
    orderBy: { returnDate: "asc" },
  });

  const results: Array<{
    bookingId: number;
    ok: boolean;
    channel?: "meta_whatsapp";
    error?: string;
    skipped?: boolean;
  }> = [];

  const BATCH_SIZE = 10;
  for (let i = 0; i < bookings.length; i += BATCH_SIZE) {
    const batch = bookings.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (booking) => {
        const result = await sendLateReturnReminderWhatsApp(booking.id);
        return {
          bookingId: booking.id,
          ok: result.ok,
          channel: result.ok ? ("meta_whatsapp" as const) : undefined,
          error: result.ok ? undefined : result.error,
          skipped: result.skipped,
        };
      }),
    );
    results.push(...batchResults);
  }

  const sent = results.filter((r) => r.ok && !r.skipped).length;
  const failed = results.filter((r) => !r.ok && !r.skipped).length;
  const skipped = results.filter((r) => r.skipped).length;

  return {
    date: todayStr,
    channel: "meta_whatsapp",
    total: bookings.length,
    sent,
    failed,
    skipped,
    results,
  };
}

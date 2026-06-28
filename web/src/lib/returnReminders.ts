import prisma from "@/lib/prisma";
import { todayIso } from "@/lib/constants";
import { whereReturnInRange } from "@/lib/bookingDateQuery";
import { sendBookingReminderWhatsApp } from "@/lib/services/whatsapp/automatedMessages";

const EXCLUDED_STATUSES = ["returned", "completed", "cancelled"] as const;

/**
 * Safety-net daily cron (9 AM IST) that sends return reminders for bookings
 * due today via the Meta WhatsApp Cloud API.
 *
 * The job queue (/api/cron/whatsapp-jobs, every 15 min) handles reminders
 * scheduled in advance. This cron catches any that were missed.
 */
export async function sendDailyReturnReminders() {
  const todayStr = todayIso();

  const bookings = await prisma.booking.findMany({
    where: {
      ...(await whereReturnInRange(todayStr, todayStr)),
      status: { notIn: [...EXCLUDED_STATUSES] },
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
        const result = await sendBookingReminderWhatsApp(booking.id);
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

  const sent = results.filter((r) => r.ok).length;
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

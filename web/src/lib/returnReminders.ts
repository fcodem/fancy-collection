import prisma from "@/lib/prisma";
import { todayIso } from "@/lib/constants";
import { whereReturnInRange } from "@/lib/bookingDateQuery";
import { formatDate } from "@/lib/constants";
import { isAisensyConfigured, aisensyCampaign } from "@/lib/aisensy";
import {
  buildReturnReminderMessage,
  deliverWhatsApp,
  returnReminderTemplateParams,
} from "@/lib/whatsapp";
import { sendTwilioSms } from "@/lib/twilio";

const EXCLUDED_STATUSES = ["returned", "completed", "cancelled"] as const;

export async function sendDailyReturnReminders() {
  const todayStr = todayIso();
  const useAisensy = isAisensyConfigured() && Boolean(aisensyCampaign("return"));

  const bookings = await prisma.booking.findMany({
    where: {
      ...(await whereReturnInRange(todayStr, todayStr)),
      status: { notIn: [...EXCLUDED_STATUSES] },
    },
    include: { bookingItems: { select: { dressName: true } } },
    orderBy: { returnTime: "asc" },
  });

  const results: Array<{
    bookingId: number;
    phone: string;
    ok: boolean;
    channel?: "aisensy" | "twilio" | "manual";
    error?: string;
    skipped?: boolean;
  }> = [];

  const BATCH_SIZE = 10;
  for (let i = 0; i < bookings.length; i += BATCH_SIZE) {
    const batch = bookings.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (booking) => {
        const phone = (booking.whatsappNo || booking.contact1 || "").trim();
        if (!phone) {
          return { bookingId: booking.id, phone: "", ok: false, error: "No phone number", skipped: true };
        }

        const reminderOpts = {
          customerName: booking.customerName,
          serialNo: booking.monthlySerial,
          returnDate: formatDate(booking.returnDate, "display"),
          returnTime: booking.returnTime,
        };

        if (useAisensy) {
          const message = buildReturnReminderMessage(reminderOpts);
          const sent = await deliverWhatsApp({
            phone,
            userName: booking.customerName,
            message,
            campaignType: "return",
            templateParams: returnReminderTemplateParams(reminderOpts),
            source: `return-reminder-${booking.id}`,
          });
          return {
            bookingId: booking.id,
            phone,
            ok: sent.delivered,
            channel: sent.delivered ? ("aisensy" as const) : ("manual" as const),
            error: sent.delivered ? undefined : sent.error || "AiSensy send failed",
            skipped: !sent.delivered && !sent.error,
          };
        }

        const smsBody = buildReturnReminderMessage(reminderOpts);
        const sent = await sendTwilioSms(phone, smsBody);
        return {
          bookingId: booking.id,
          phone,
          ok: sent.ok,
          channel: sent.ok ? ("twilio" as const) : undefined,
          error: sent.ok ? undefined : sent.error,
          skipped: !sent.ok && "skipped" in sent ? sent.skipped : undefined,
        };
      })
    );
    results.push(...batchResults);
  }

  const sent = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok && !r.skipped).length;
  const skipped = results.filter((r) => r.skipped).length;

  return {
    date: todayStr,
    channel: useAisensy ? "aisensy" : "twilio",
    total: bookings.length,
    sent,
    failed,
    skipped,
    results,
  };
}

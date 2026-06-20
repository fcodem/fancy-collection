import prisma, { todayEndQ, todayStartQ } from "@/lib/prisma";
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
  const today = todayStartQ();
  const todayEnd = todayEndQ();
  const useAisensy = isAisensyConfigured() && Boolean(aisensyCampaign("return"));

  const bookings = await prisma.booking.findMany({
    where: {
      returnDate: { gte: today, lt: todayEnd },
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

  for (const booking of bookings) {
    const phone = (booking.whatsappNo || booking.contact1 || "").trim();
    if (!phone) {
      results.push({ bookingId: booking.id, phone: "", ok: false, error: "No phone number", skipped: true });
      continue;
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
      results.push({
        bookingId: booking.id,
        phone,
        ok: sent.delivered,
        channel: sent.delivered ? "aisensy" : "manual",
        error: sent.delivered ? undefined : sent.error || "AiSensy send failed",
        skipped: !sent.delivered && !sent.error,
      });
      continue;
    }

    const smsBody = buildReturnReminderMessage(reminderOpts);
    const sent = await sendTwilioSms(phone, smsBody);
    results.push({
      bookingId: booking.id,
      phone,
      ok: sent.ok,
      channel: sent.ok ? "twilio" : undefined,
      error: sent.ok ? undefined : sent.error,
      skipped: !sent.ok && "skipped" in sent ? sent.skipped : undefined,
    });
  }

  const sent = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok && !r.skipped).length;
  const skipped = results.filter((r) => r.skipped).length;

  return {
    date: today.toISOString().slice(0, 10),
    channel: useAisensy ? "aisensy" : "twilio",
    total: bookings.length,
    sent,
    failed,
    skipped,
    results,
  };
}

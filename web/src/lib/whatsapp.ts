import { aisensyCampaign, isAisensyConfigured, sendAisensyCampaign } from "@/lib/aisensy";
import { digitsOnly } from "@/lib/phone";

export function buildWhatsAppUrl(phone: string, message: string): string {
  let clean = digitsOnly(phone);
  if (clean.length === 10) clean = "91" + clean;
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
}

export type WhatsAppDeliveryResult = {
  delivered: boolean;
  via: "aisensy" | "manual";
  whatsappUrl?: string;
  message: string;
  error?: string;
  messageId?: string;
};

export async function deliverWhatsApp(opts: {
  phone: string;
  userName: string;
  message: string;
  campaignType: "booking" | "prospect" | "return";
  templateParams?: string[];
  source?: string;
}): Promise<WhatsAppDeliveryResult> {
  const whatsappUrl = buildWhatsAppUrl(opts.phone, opts.message);
  const campaignName = aisensyCampaign(opts.campaignType);

  if (isAisensyConfigured() && campaignName) {
    const sent = await sendAisensyCampaign({
      campaignName,
      phone: opts.phone,
      userName: opts.userName,
      templateParams: opts.templateParams ?? [opts.message],
      source: opts.source,
    });

    if (sent.ok) {
      return {
        delivered: true,
        via: "aisensy",
        message: opts.message,
        messageId: sent.messageId,
      };
    }

    return {
      delivered: false,
      via: "manual",
      whatsappUrl,
      message: opts.message,
      error: sent.error,
    };
  }

  return {
    delivered: false,
    via: "manual",
    whatsappUrl,
    message: opts.message,
  };
}

export function buildBookingConfirmationMessage(opts: {
  customerName: string;
  serialNo: number;
  deliveryDate: string;
  deliveryTime?: string;
  returnDate: string;
  returnTime?: string;
  venue?: string;
  totalRent: number;
  advancePaid: number;
  remaining: number;
  dressNames: string[];
  qrUrl?: string;
  billUrl?: string;
}): string {
  const serial = String(opts.serialNo).padStart(2, "0");
  const dresses = opts.dressNames.map((d, i) => `${i + 1}. ${d}`).join("\n");

  let msg =
    `🙏 *Thank you for choosing Fancy Collection!*\n\n` +
    `Dear *${opts.customerName}*, your booking is confirmed.\n\n`;

  if (opts.qrUrl) {
    msg += `📱 *Booking QR Code:*\n${opts.qrUrl}\n\n`;
  }

  msg +=
    `📋 *Booking Details*\n` +
    `Serial #: *${serial}*\n` +
    `📅 Delivery: *${opts.deliveryDate}*` +
    (opts.deliveryTime ? ` (${opts.deliveryTime})` : "") +
    `\n📅 Return: *${opts.returnDate}*` +
    (opts.returnTime ? ` (${opts.returnTime})` : "") +
    (opts.venue ? `\n📍 Venue: *${opts.venue}*` : "") +
    `\n\n👗 *Your Dresses:*\n${dresses}\n\n` +
    `💰 Total Rent: ₹${opts.totalRent.toLocaleString("en-IN")}\n` +
    `✅ Advance Paid: ₹${opts.advancePaid.toLocaleString("en-IN")}\n` +
    `📌 Balance: ₹${opts.remaining.toLocaleString("en-IN")}\n`;

  if (opts.billUrl) {
    msg += `\n🧾 View Bill: ${opts.billUrl}\n`;
  }

  msg += `\n✨ *FANCY COLLECTION BY RENU AGARWAL*\nRENT | WEAR | RETURN\n📞 8630834711, 8077843874`;
  return msg;
}

/** Template params for AiSensy booking confirmation campaign ({{1}}..{{10}}). */
export function bookingConfirmationTemplateParams(opts: {
  customerName: string;
  serialNo: number;
  deliveryDate: string;
  deliveryTime?: string;
  returnDate: string;
  returnTime?: string;
  venue?: string;
  totalRent: number;
  advancePaid: number;
  remaining: number;
  dressNames: string[];
  billUrl?: string;
}): string[] {
  const serial = String(opts.serialNo).padStart(2, "0");
  return [
    opts.customerName,
    serial,
    `${opts.deliveryDate}${opts.deliveryTime ? ` (${opts.deliveryTime})` : ""}`,
    `${opts.returnDate}${opts.returnTime ? ` (${opts.returnTime})` : ""}`,
    opts.dressNames.join(", "),
    opts.totalRent.toLocaleString("en-IN"),
    opts.advancePaid.toLocaleString("en-IN"),
    opts.remaining.toLocaleString("en-IN"),
    opts.venue || "-",
    opts.billUrl || "-",
  ];
}

export function buildProspectReminderMessage(opts: {
  customerName: string;
  deliveryDate: string;
  deliveryTime?: string;
  returnDate: string;
  returnTime?: string;
  venue?: string;
  dressNames: string[];
  allAvailable: boolean;
  unavailableNames: string[];
}): string {
  const dresses = opts.dressNames.join(", ");
  let msg =
    `Namaste ${opts.customerName}!\n\n` +
    `Aapne *Fancy Collection* par in dresses ke liye interest dikhaya tha:\n` +
    `👗 *${dresses}*\n\n` +
    `📅 Delivery: *${opts.deliveryDate}*` +
    (opts.deliveryTime ? ` (${opts.deliveryTime})` : "") +
    `\n📅 Return: *${opts.returnDate}*` +
    (opts.returnTime ? ` (${opts.returnTime})` : "") +
    (opts.venue ? `\n📍 Venue: *${opts.venue}*` : "") +
    `\n\n`;

  if (opts.allAvailable) {
    msg +=
      `✅ *Good news!* Aapki selected dresses abhi bhi available hain in dates par.\n` +
      `Jaldi se apni booking confirm kar lijiye — pehle aaya, pehle paaya! 🎉\n\n`;
  } else {
    msg +=
      `⚠️ Kuch dresses ab in dates par available nahi hain:\n` +
      `*${opts.unavailableNames.join(", ")}*\n\n` +
      `Baaki dresses abhi bhi available ho sakti hain. Kripya humse contact karein — hum aapke liye best option dhundhenge.\n\n`;
  }

  msg += `✨ *Fancy Collection* – Premium Rental Service`;
  return msg;
}

/** Template params for AiSensy prospect reminder campaign ({{1}}..{{6}}). */
export function prospectReminderTemplateParams(opts: {
  customerName: string;
  deliveryDate: string;
  returnDate: string;
  dressNames: string[];
  allAvailable: boolean;
  unavailableNames: string[];
}): string[] {
  return [
    opts.customerName,
    opts.dressNames.join(", "),
    opts.deliveryDate,
    opts.returnDate,
    opts.allAvailable ? "All dresses available" : "Some dresses unavailable",
    opts.unavailableNames.join(", ") || "-",
  ];
}

export function buildReturnReminderMessage(opts: {
  customerName: string;
  serialNo: number;
  returnDate: string;
  returnTime: string;
}): string {
  const serial = String(opts.serialNo).padStart(2, "0");
  return (
    `Hi ${opts.customerName}! Fancy Collection reminder: your rental (Booking #${serial}) is due for return today, ` +
    `${opts.returnDate}${opts.returnTime ? ` by ${opts.returnTime}` : ""}. ` +
    `Please return on time. Thank you! - Fancy Collection`
  );
}

/** Template params for AiSensy return reminder campaign ({{1}}..{{4}}). */
export function returnReminderTemplateParams(opts: {
  customerName: string;
  serialNo: number;
  returnDate: string;
  returnTime: string;
}): string[] {
  return [
    opts.customerName,
    String(opts.serialNo).padStart(2, "0"),
    opts.returnDate,
    opts.returnTime || "-",
  ];
}

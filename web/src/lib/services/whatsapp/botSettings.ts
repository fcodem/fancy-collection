import prisma from "@/lib/prisma";
import { BRAND_APP_TITLE } from "@/lib/branding";

export type WhatsAppBotSettings = {
  shopName: string;
  address: string;
  hours: string;
  phone: string;
  greetingReply: string;
  priceReply: string;
  rentalProcessReply: string;
  securityAdvanceReply: string;
  handoverReply: string;
  bookingCompleteReply: string;
  botEnabled: boolean;
  flowEnabled: boolean;
  maxInvalidResponses: number;
};

const DEFAULT_HOURS = "10:00 AM – 9:00 PM (all days)";

function envBool(name: string, fallback: boolean): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes") return true;
  if (v === "0" || v === "false" || v === "no") return false;
  return fallback;
}

function buildDefaults(): WhatsAppBotSettings {
  const shopName = process.env.WHATSAPP_BOT_SHOP_NAME?.trim() || BRAND_APP_TITLE;
  const address = process.env.WHATSAPP_BOT_ADDRESS?.trim() || "";
  const hours = process.env.WHATSAPP_BOT_HOURS?.trim() || DEFAULT_HOURS;
  const phone = process.env.WHATSAPP_BOT_PHONE?.trim() || "";

  return {
    shopName,
    address,
    hours,
    phone,
    greetingReply:
      `Namaste! 🙏 Welcome to ${shopName}.\nHow can we help you today?\n` +
      "You can ask about:\n• Available outfits & jewellery 👗💍\n• Rental price 💰\n• Booking for your function date 🗓️\n• Shop address & timings 📍",
    priceReply:
      "Our rental price depends on the outfit/jewellery and the number of days. 💰\n" +
      "Please share:\n1️⃣ The item you like (or a photo)\n2️⃣ Your function date\n" +
      "Our team will share the exact rent and availability shortly.",
    rentalProcessReply:
      "To rent with us:\n1️⃣ Share item/category and function dates\n2️⃣ Visit or message for trial\n3️⃣ Pay advance + security deposit to confirm\n" +
      "Our team will guide you with exact steps for your outfit.",
    securityAdvanceReply:
      "For bookings we take an advance to confirm and a refundable security deposit, both returned/adjusted as per our policy. 🧾\n" +
      "Our team will explain the exact amounts for your chosen item.",
    handoverReply: "Our team will assist you personally. Someone will reply shortly. 🙏",
    bookingCompleteReply:
      "Thank you. Our team will check availability and confirm shortly.",
    botEnabled: !envBool("WHATSAPP_BOT_DISABLED", false),
    flowEnabled: envBool("WHATSAPP_BOT_FLOW_ENABLED", true),
    maxInvalidResponses: Math.max(
      1,
      parseInt(process.env.WHATSAPP_BOT_MAX_INVALID_RESPONSES?.trim() || "3", 10) || 3,
    ),
  };
}

let cached: WhatsAppBotSettings | null = null;
let cachedAt = 0;
const CACHE_MS = 30_000;

export function getWhatsAppBotSettingsDefaults(): WhatsAppBotSettings {
  return buildDefaults();
}

/** Load bot settings: DB overrides env/code defaults when present. */
export async function loadWhatsAppBotSettings(): Promise<WhatsAppBotSettings> {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_MS) return cached;

  const defaults = buildDefaults();
  try {
    const row = await prisma.whatsAppBotConfig.findUnique({ where: { id: 1 } });
    if (!row) {
      cached = defaults;
      cachedAt = now;
      return defaults;
    }

    cached = {
      shopName: row.shopName?.trim() || defaults.shopName,
      address: row.address?.trim() || defaults.address,
      hours: row.hours?.trim() || defaults.hours,
      phone: row.phone?.trim() || defaults.phone,
      greetingReply: row.greetingReply?.trim() || defaults.greetingReply,
      priceReply: row.priceReply?.trim() || defaults.priceReply,
      rentalProcessReply: row.rentalProcessReply?.trim() || defaults.rentalProcessReply,
      securityAdvanceReply: row.securityAdvanceReply?.trim() || defaults.securityAdvanceReply,
      handoverReply: row.handoverReply?.trim() || defaults.handoverReply,
      bookingCompleteReply: row.bookingCompleteReply?.trim() || defaults.bookingCompleteReply,
      botEnabled: row.botEnabled,
      flowEnabled: row.flowEnabled,
      maxInvalidResponses: defaults.maxInvalidResponses,
    };
    cachedAt = now;
    return cached;
  } catch {
    return defaults;
  }
}

export function clearWhatsAppBotSettingsCache(): void {
  cached = null;
  cachedAt = 0;
}

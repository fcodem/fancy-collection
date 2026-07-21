import prisma from "@/lib/prisma";
import { BRAND_APP_TITLE } from "@/lib/branding";

export type WhatsAppBotSettings = {
  shopName: string;
  address: string;
  hours: string;
  phone: string;
  phone2: string;
  mapsUrl: string;
  instagramUrl: string;
  greetingReply: string;
  priceReply: string;
  rentalProcessReply: string;
  securityAdvanceReply: string;
  handoverReply: string;
  bookingCompleteReply: string;
  botEnabled: boolean;
  flowEnabled: boolean;
  maxInvalidResponses: number;
  welcomeCooldownDays: number;
};

const DEFAULT_HOURS = "10:00 AM – 9:00 PM (all days)";
const DEFAULT_ADDRESS =
  "Baradari Road, near Chirag Nursing Home, near BalaJi Mandir Road, Moradabad, Uttar Pradesh 244001";
const DEFAULT_MAPS_URL =
  "https://www.google.com/maps?q=Fancy+collection,+Baradari+road,+near+chirag+nursing+home,+near+BalaJi+Mandir+Road,+Moradabad,+Uttar+Pradesh+244001&ftid=0x390afb7100ba11d3:0xd2a828b8a99559d6&entry=gps";
const DEFAULT_INSTAGRAM_URL = "https://www.instagram.com/fancycollection_renuagarwal";
const DEFAULT_PHONE_1 = "8077843874";
const DEFAULT_PHONE_2 = "8630834711";

function envBool(name: string, fallback: boolean): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes") return true;
  if (v === "0" || v === "false" || v === "no") return false;
  return fallback;
}

function buildDefaults(): WhatsAppBotSettings {
  const shopName = process.env.WHATSAPP_BOT_SHOP_NAME?.trim() || BRAND_APP_TITLE;
  const address = process.env.WHATSAPP_BOT_ADDRESS?.trim() || DEFAULT_ADDRESS;
  const hours = process.env.WHATSAPP_BOT_HOURS?.trim() || DEFAULT_HOURS;
  const phone = process.env.WHATSAPP_BOT_PHONE?.trim() || DEFAULT_PHONE_1;
  const phone2 = process.env.WHATSAPP_BOT_PHONE_2?.trim() || DEFAULT_PHONE_2;
  const mapsUrl = process.env.WHATSAPP_BOT_MAPS_URL?.trim() || DEFAULT_MAPS_URL;
  const instagramUrl = process.env.WHATSAPP_BOT_INSTAGRAM_URL?.trim() || DEFAULT_INSTAGRAM_URL;
  const welcomeCooldownDays = Math.max(
    1,
    parseInt(process.env.WHATSAPP_BOT_WELCOME_COOLDOWN_DAYS?.trim() || "30", 10) || 30,
  );

  return {
    shopName,
    address,
    hours,
    phone,
    phone2,
    mapsUrl,
    instagramUrl,
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
    welcomeCooldownDays,
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
      phone2: defaults.phone2,
      mapsUrl: defaults.mapsUrl,
      instagramUrl: defaults.instagramUrl,
      greetingReply: row.greetingReply?.trim() || defaults.greetingReply,
      priceReply: row.priceReply?.trim() || defaults.priceReply,
      rentalProcessReply: row.rentalProcessReply?.trim() || defaults.rentalProcessReply,
      securityAdvanceReply: row.securityAdvanceReply?.trim() || defaults.securityAdvanceReply,
      handoverReply: row.handoverReply?.trim() || defaults.handoverReply,
      bookingCompleteReply: row.bookingCompleteReply?.trim() || defaults.bookingCompleteReply,
      botEnabled: row.botEnabled,
      flowEnabled: row.flowEnabled,
      maxInvalidResponses: defaults.maxInvalidResponses,
      welcomeCooldownDays: defaults.welcomeCooldownDays,
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

/** Professional auto-welcome sent on first contact or after a long gap. */
export function buildProfessionalWelcomeMessage(settings: WhatsAppBotSettings): string {
  const phones = [settings.phone, settings.phone2].filter(Boolean).join("  •  ");

  return (
    `✨ *Welcome to ${settings.shopName}* ✨\n\n` +
    `Namaste! 🙏 We are delighted to connect with you.\n\n` +
    `Moradabad's trusted boutique for premium bridal & designer outfit rentals — ` +
    `Lehenga, Sherwani, Gown, Saree, Jewellery & more.\n\n` +
    `📍 *Store Address*\n${settings.address}\n\n` +
    `🕙 *Open:* ${settings.hours}\n\n` +
    `📞 *For further queries, contact us on:*\n${phones}\n\n` +
    `Tap the button below for Google Maps directions.\n\n` +
    `👗 *View our dress samples on Instagram:*\n${settings.instagramUrl}\n\n` +
    `Please share the outfit you are looking for and your function date — our team will assist you shortly. 🙏`
  );
}

export function buildWelcomeLinkButtons(settings: WhatsAppBotSettings): { displayText: string; url: string }[] {
  return [
    { displayText: "📍 Shop Location", url: settings.mapsUrl },
    { displayText: "👗 View Dress Samples", url: settings.instagramUrl },
  ];
}

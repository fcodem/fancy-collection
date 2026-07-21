import prisma from "@/lib/prisma";
import { BRAND_APP_TITLE } from "@/lib/branding";
import { isWhatsAppConfigured, sendWhatsAppText } from "./metaApi";

/**
 * WhatsApp auto-reply chatbot.
 *
 * Behaviour: replies automatically to inbound customer messages until a human
 * team member takes control of the chat. "Taking control" is detected from the
 * data itself — as soon as any manual (non-automated) outbound message exists in
 * a conversation, the bot stops replying to that conversation. This needs no
 * schema change and works immediately.
 *
 * Global kill switch: set WHATSAPP_BOT_DISABLED=1 to turn the bot off entirely.
 *
 * The reply rules below are plain keyword → answer pairs and are meant to be
 * edited freely for your shop. Optional env overrides:
 *   WHATSAPP_BOT_SHOP_NAME, WHATSAPP_BOT_ADDRESS, WHATSAPP_BOT_HOURS,
 *   WHATSAPP_BOT_PHONE
 */

const SHOP_NAME = process.env.WHATSAPP_BOT_SHOP_NAME?.trim() || BRAND_APP_TITLE;
const SHOP_ADDRESS = process.env.WHATSAPP_BOT_ADDRESS?.trim() || "";
const SHOP_HOURS = process.env.WHATSAPP_BOT_HOURS?.trim() || "10:00 AM – 9:00 PM (all days)";
const SHOP_PHONE = process.env.WHATSAPP_BOT_PHONE?.trim() || "";

/** Master kill switch for the whole auto-reply bot. */
export function isAutoReplyDisabled(): boolean {
  const v = process.env.WHATSAPP_BOT_DISABLED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

type Rule = { keywords: string[]; reply: string };

// First matching rule wins. Keep more specific intents higher up.
const RULES: Rule[] = [
  {
    keywords: ["price", "rate", "cost", "charge", "kitna", "kitne", "kimat", "kiraya", "rent", "rental"],
    reply:
      "Our rental price depends on the outfit/jewellery and the number of days. 💰\n" +
      "Please share:\n1️⃣ The item you like (or a photo)\n2️⃣ Your function date\n" +
      "Our team will share the exact rent and availability shortly.",
  },
  {
    keywords: ["available", "availability", "book", "booking", "date", "chahiye", "chaiye", "want", "need", "reserve"],
    reply:
      "We'd love to help with your booking. 🗓️\nPlease tell us:\n" +
      "1️⃣ Item / category (Lehenga, Sherwani, Gown, Jewellery, etc.)\n" +
      "2️⃣ Function date (delivery & return)\n" +
      "We'll check availability and confirm for you.",
  },
  {
    keywords: ["location", "address", "where", "kaha", "kahaan", "shop", "store", "map", "direction", "reach"],
    reply: SHOP_ADDRESS
      ? `📍 You can visit us at:\n${SHOP_ADDRESS}\n\nWe're open ${SHOP_HOURS}.`
      : `We'd be happy to share our location. 📍 Our team will send you the shop address and map shortly.`,
  },
  {
    keywords: ["time", "timing", "open", "close", "hours", "kab", "khula", "khulega"],
    reply: `🕙 We're open ${SHOP_HOURS}. Feel free to visit or message us anytime — we'll reply as soon as possible.`,
  },
  {
    keywords: ["deposit", "security", "advance", "refund", "return", "wapas"],
    reply:
      "For bookings we take an advance to confirm and a refundable security deposit, both returned/adjusted as per our policy. 🧾\n" +
      "Our team will explain the exact amounts for your chosen item.",
  },
  {
    keywords: ["order", "custom", "stitch", "tailor", "design", "banwana"],
    reply:
      "Yes, we also take custom orders for special outfits. ✂️\nPlease share the design/photo and your function date, and our team will guide you.",
  },
  {
    keywords: ["thank", "thanks", "thankyou", "dhanyavad", "shukriya", "great", "ok thanks"],
    reply: `You're most welcome! 😊 Thank you for choosing ${SHOP_NAME}. Feel free to message us anytime.`,
  },
  {
    keywords: ["hi", "hii", "hello", "helo", "hey", "hlo", "namaste", "namaskar", "gm", "good morning", "good evening", "good afternoon"],
    reply:
      `Namaste! 🙏 Welcome to ${SHOP_NAME}.\nHow can we help you today?\n` +
      "You can ask about:\n• Available outfits & jewellery 👗💍\n• Rental price 💰\n• Booking for your function date 🗓️\n• Shop address & timings 📍",
  },
];

const FALLBACK =
  `Thank you for messaging ${SHOP_NAME}! 🙏\n` +
  "Our team will reply to you very shortly. Meanwhile, please share the item you're looking for and your function date so we can help you faster.";

const MEDIA_ACK =
  `Thank you, we've received your message. 🙏 Our team will review it and reply to you shortly.` +
  (SHOP_PHONE ? `\nFor anything urgent, call us at ${SHOP_PHONE}.` : "");

function normalize(text: string): string {
  return ` ${text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()} `;
}

function matchRule(text: string): string | null {
  const hay = normalize(text);
  for (const rule of RULES) {
    for (const kw of rule.keywords) {
      // whole-word match to avoid false positives (e.g. "hi" inside "this")
      if (hay.includes(` ${kw} `)) return rule.reply;
    }
  }
  return null;
}

/** Build the auto-reply text for an inbound message. Always returns something helpful. */
export function buildAutoReply(
  text: string,
  opts: { isFirstContact?: boolean; isTextMessage?: boolean } = {},
): string {
  if (opts.isTextMessage === false) return MEDIA_ACK;

  const matched = matchRule(text || "");
  if (matched) return matched;

  // No keyword matched: greet on first contact, else fall back politely.
  if (opts.isFirstContact) {
    return (
      `Namaste! 🙏 Welcome to ${SHOP_NAME}.\n` +
      "Please tell us the outfit/jewellery you're looking for and your function date, and our team will help you right away."
    );
  }
  return FALLBACK;
}

/**
 * Send an auto-reply for an inbound message, unless the bot is disabled or a
 * human has already taken over this conversation. Never throws.
 */
export async function handleInboundAutoReply(args: {
  conversationId: number;
  phone: string;
  inboundText: string;
  messageType: string;
  isFirstContact?: boolean;
}): Promise<void> {
  try {
    if (isAutoReplyDisabled()) return;
    if (!isWhatsAppConfigured()) return;

    // Human takeover check: if any manual (non-automated) outbound reply exists
    // in this conversation, the team has taken control — stay silent.
    const humanReplies = await prisma.whatsAppMessage.count({
      where: {
        conversationId: args.conversationId,
        direction: "outbound",
        isAutomated: false,
      },
    });
    if (humanReplies > 0) return;

    const reply = buildAutoReply(args.inboundText, {
      isFirstContact: args.isFirstContact,
      isTextMessage: args.messageType === "text" || args.messageType === "interactive",
    });
    if (!reply.trim()) return;

    const result = await sendWhatsAppText(args.phone, reply);
    if (!result.ok) {
      console.warn(`[bot] Auto-reply send failed to ${args.phone}: ${result.error}`);
      return;
    }

    await prisma.whatsAppMessage.create({
      data: {
        conversationId: args.conversationId,
        phone: args.phone,
        direction: "outbound",
        messageType: "text",
        body: reply,
        metaMessageId: result.messageId ?? null,
        isAutomated: true,
        deliveryStatus: "sent",
      },
    });

    await prisma.whatsAppConversation.update({
      where: { id: args.conversationId },
      data: { lastMessageAt: new Date() },
    });

    console.log(`[bot] Auto-replied to ${args.phone.replace(/\d(?=\d{4})/g, "*")}`);
  } catch (e) {
    console.error("[bot] Auto-reply error:", e);
  }
}

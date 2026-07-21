import {
  BASE_JEWELLERY,
  BASE_MENS,
  BASE_WOMENS,
  BUSINESS_TIMEZONE,
  formatDate,
  isDateBeforeToday,
  parseDate,
  todayIso,
} from "@/lib/constants";
import type { WhatsAppBotSettings } from "./botSettings";
import {
  buildProfessionalWelcomeMessage,
  buildWelcomeLinkButtons,
} from "./botSettings";

export const BOT_MODES = ["ACTIVE", "NEEDS_STAFF", "TEAM_HANDLING"] as const;
export type BotMode = (typeof BOT_MODES)[number];

export const BOT_STEPS = [
  "IDLE",
  "AWAITING_CATEGORY",
  "AWAITING_DELIVERY_DATE",
  "AWAITING_RETURN_DATE",
  "AWAITING_SIZE",
  "AWAITING_COLOUR",
  "READY_FOR_STAFF",
] as const;
export type BotStep = (typeof BOT_STEPS)[number];

export type BotConversationState = {
  botMode: BotMode;
  botStep: BotStep;
  botCategory: string | null;
  botDeliveryDate: string | null;
  botReturnDate: string | null;
  botSize: string | null;
  botColour: string | null;
  botNotes: string | null;
  botInvalidAttempts: number;
  handoverMessageSentAt: Date | null;
  lastAutomatedInboundMetaMessageId: string | null;
};

export type BotProcessResult = {
  reply: string | null;
  quickReplyButtons?: { id: string; title: string }[];
  urlButtons?: { displayText: string; url: string }[];
  nextState: Partial<BotConversationState>;
  sendHandover: boolean;
  resetInvalidAttempts?: boolean;
  incrementInvalidAttempts?: boolean;
  markWelcomeSent?: boolean;
};

const DATE_INVALID_MSG =
  "Please enter the date in DD-MM-YYYY format, for example 24-07-2026.";

const FORBIDDEN_CONFIRMATION =
  /\b(your booking is confirmed|dress is booked|definitely available|booking confirmed)\b/i;

/** Category keyword → canonical label (inventory-aligned). */
const CATEGORY_KEYWORDS: { keywords: string[]; category: string }[] = [
  { keywords: ["bridal lehenga", "bridal lehnga"], category: "Bridal Lehenga" },
  { keywords: ["non bridal lehenga", "non-bridal lehenga"], category: "Non Bridal Lehenga" },
  { keywords: ["lehenga", "lehnga", "lengha"], category: "Lehenga" },
  { keywords: ["gown", "reception gown"], category: "Gown" },
  { keywords: ["saree", "sari"], category: "Saree" },
  { keywords: ["crop top"], category: "Crop Top" },
  { keywords: ["bodycon"], category: "Bodycon" },
  { keywords: ["sherwani", "sherwani suit"], category: "Sherwani" },
  { keywords: ["coat suit", "coatsuit"], category: "Coat Suit" },
  { keywords: ["jodhpuri"], category: "Jodhpuri" },
  { keywords: ["tuxedo"], category: "Tuxedo" },
  { keywords: ["indo western", "indowestern", "indo-western"], category: "Indowestern" },
  { keywords: ["bridal jewellery", "bridal jewelry"], category: "Bridal Jewellery" },
  { keywords: ["kundan"], category: "Kundan Jewellery" },
  { keywords: ["polki"], category: "Polki Jewellery" },
  { keywords: ["ad jewellery", " ad ", "american diamond"], category: "AD Jewellery" },
  { keywords: ["jewellery", "jewelry"], category: "Jewellery" },
];

const BOOKING_START_KEYWORDS = [
  "book",
  "booking",
  "available",
  "availability",
  "chahiye",
  "chaiye",
  "reserve",
  "want",
  "need",
  "rent",
  "outfit",
  "dress",
];

const HANDOVER_KEYWORDS = [
  "complaint",
  "refund",
  "cancellation",
  "cancel booking",
  "payment problem",
  "payment issue",
  "discount",
  "damage",
  "damaged",
  "wrong dress",
  "urgent delivery",
  "human",
  "staff",
  "manager",
  "owner",
  "call me",
  "baat karni",
  "baat karna",
  "talk to someone",
  "speak to someone",
];

const QUICK_CATEGORY_BUTTONS = [
  { id: "cat_lehenga", title: "Lehenga" },
  { id: "cat_sherwani", title: "Sherwani" },
  { id: "cat_gown", title: "Gown" },
];

const QUICK_WELCOME_BUTTONS = [
  { id: "welcome_booking", title: "Booking Enquiry" },
  { id: "welcome_price", title: "Price Information" },
  { id: "welcome_location", title: "Shop Location" },
];

const QUICK_CATEGORY_MAP: Record<string, string> = {
  cat_lehenga: "Lehenga",
  cat_sherwani: "Sherwani",
  cat_gown: "Gown",
  welcome_booking: "__start_booking__",
  welcome_price: "__price__",
  welcome_location: "__location__",
  lehenga: "Lehenga",
  sherwani: "Sherwani",
  gown: "Gown",
  "booking enquiry": "__start_booking__",
  "price information": "__price__",
  "shop location": "__location__",
};

export function normalizeBotText(text: string): string {
  return ` ${text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()} `;
}

export function containsKeyword(hay: string, keywords: string[]): boolean {
  for (const kw of keywords) {
    if (hay.includes(` ${kw} `)) return true;
  }
  return false;
}

export function extractCategory(text: string): string | null {
  const hay = normalizeBotText(text);
  for (const row of CATEGORY_KEYWORDS) {
    for (const kw of row.keywords) {
      if (hay.includes(` ${kw.trim()} `)) return row.category;
    }
  }
  // Match inventory base categories
  const all = [...BASE_WOMENS, ...BASE_MENS, ...BASE_JEWELLERY];
  for (const cat of all) {
    const token = cat.toLowerCase();
    if (hay.includes(` ${token} `)) return cat;
  }
  return null;
}

export function isBookingIntent(text: string): boolean {
  const hay = normalizeBotText(text);
  return containsKeyword(hay, BOOKING_START_KEYWORDS) || extractCategory(text) !== null;
}

export function isHandoverIntent(text: string): boolean {
  const hay = normalizeBotText(text);
  return containsKeyword(hay, HANDOVER_KEYWORDS);
}

/** Parse DD-MM-YYYY, DD/MM/YYYY, DD MM YYYY → ISO YYYY-MM-DD in Asia/Kolkata business sense. */
export function parseCustomerDate(text: string): { ok: true; iso: string } | { ok: false } {
  const trimmed = text.trim();
  const m = trimmed.match(/^(\d{1,2})[-/\s](\d{1,2})[-/\s](\d{4})$/);
  if (!m) return { ok: false };

  const day = parseInt(m[1]!, 10);
  const month = parseInt(m[2]!, 10);
  const year = parseInt(m[3]!, 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return { ok: false };

  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const parsed = parseDate(iso);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    return { ok: false };
  }
  return { ok: true, iso };
}

export function formatDisplayDate(iso: string): string {
  return formatDate(parseDate(iso), "display");
}

export function buildEnquirySummary(state: BotConversationState): string {
  const lines = [
    "📋 Booking enquiry summary:",
    `Category: ${state.botCategory || "—"}`,
    `Delivery: ${state.botDeliveryDate ? formatDisplayDate(state.botDeliveryDate) : "—"}`,
    `Return: ${state.botReturnDate ? formatDisplayDate(state.botReturnDate) : "—"}`,
    `Size: ${state.botSize || "—"}`,
    `Colour: ${state.botColour || "—"}`,
  ];
  return lines.join("\n");
}

export type KeywordRule = { id: string; keywords: string[]; buildReply: (s: WhatsAppBotSettings) => string };

export function buildKeywordRules(settings: WhatsAppBotSettings): KeywordRule[] {
  return [
    {
      id: "staff",
      keywords: ["human", "staff", "manager", "owner", "call me", "baat karni", "baat karna"],
      buildReply: () => settings.handoverReply,
    },
    {
      id: "price",
      keywords: ["price", "rate", "cost", "charge", "kitna", "kitne", "kimat", "kiraya", "rent", "rental"],
      buildReply: () => settings.priceReply,
    },
    {
      id: "location",
      keywords: ["location", "address", "where", "kaha", "kahaan", "shop", "store", "map", "direction", "reach"],
      buildReply: (s) =>
        s.address
          ? `📍 You can visit us at:\n${s.address}\n\nWe're open ${s.hours}.`
          : `We'd be happy to share our location. 📍 Our team will send you the shop address and map shortly.`,
    },
    {
      id: "timing",
      keywords: ["time", "timing", "open", "close", "hours", "kab", "khula", "khulega"],
      buildReply: (s) =>
        `🕙 We're open ${s.hours}. Feel free to visit or message us anytime — we'll reply as soon as possible.`,
    },
    {
      id: "advance",
      keywords: ["deposit", "security", "advance"],
      buildReply: (s) => s.securityAdvanceReply,
    },
    {
      id: "rental_process",
      keywords: ["process", "how to rent", "rental process", "kaise", "procedure"],
      buildReply: (s) => s.rentalProcessReply,
    },
    {
      id: "documents",
      keywords: ["document", "documents", "id proof", "aadhar", "pan card", "required"],
      buildReply: () =>
        "For rental we usually need a valid ID proof (Aadhaar/PAN/Driving Licence) and contact details. 🪪\nOur team will confirm what is needed for your booking.",
    },
    {
      id: "thank",
      keywords: ["thank", "thanks", "thankyou", "dhanyavad", "shukriya", "ok thanks"],
      buildReply: (s) =>
        `You're most welcome! 😊 Thank you for choosing ${s.shopName}. Feel free to message us anytime.`,
    },
    {
      id: "greeting",
      keywords: [
        "hi",
        "hii",
        "hello",
        "helo",
        "hey",
        "hlo",
        "namaste",
        "namaskar",
        "gm",
        "good morning",
        "good evening",
        "good afternoon",
      ],
      buildReply: (s) => s.greetingReply,
    },
    {
      id: "basic_booking",
      keywords: ["book", "booking", "available", "availability", "chahiye", "chaiye", "reserve"],
      buildReply: () =>
        "We'd love to help with your booking. 🗓️\nPlease tell us the item/category (Lehenga, Sherwani, Gown, Jewellery, etc.) and your delivery & return dates.",
    },
  ];
}

export function matchKeywordRule(text: string, settings: WhatsAppBotSettings): KeywordRule | null {
  const hay = normalizeBotText(text);
  for (const rule of buildKeywordRules(settings)) {
    if (containsKeyword(hay, rule.keywords)) return rule;
  }
  return null;
}

function resolveQuickReply(text: string): string | null {
  const key = text.trim().toLowerCase();
  return QUICK_CATEGORY_MAP[key] ?? QUICK_CATEGORY_MAP[`cat_${key}`] ?? null;
}

function buildAutoWelcomeResult(settings: WhatsAppBotSettings): BotProcessResult {
  return {
    reply: buildProfessionalWelcomeMessage(settings),
    urlButtons: buildWelcomeLinkButtons(settings),
    nextState: {},
    sendHandover: false,
    resetInvalidAttempts: true,
    markWelcomeSent: true,
  };
}

/** True when the professional welcome should be sent (first contact or long gap). */
export function shouldSendAutoWelcome(args: {
  isFirstContact: boolean;
  daysSinceLastInbound: number | null;
  botMode: BotMode;
  botStep: BotStep;
  settings: WhatsAppBotSettings;
}): boolean {
  if (args.botMode !== "ACTIVE") return false;
  if (args.botStep !== "IDLE") return false;
  if (args.isFirstContact) return true;
  if (args.daysSinceLastInbound === null) return true;
  return args.daysSinceLastInbound >= args.settings.welcomeCooldownDays;
}

function handoverResult(
  settings: WhatsAppBotSettings,
  state: BotConversationState,
): BotProcessResult {
  if (state.handoverMessageSentAt || state.botMode === "NEEDS_STAFF") {
    return { reply: null, nextState: {}, sendHandover: false };
  }
  return {
    reply: settings.handoverReply,
    nextState: {
      botMode: "NEEDS_STAFF",
      botStep: state.botStep === "IDLE" ? "IDLE" : state.botStep,
      handoverMessageSentAt: new Date(),
    },
    sendHandover: true,
    resetInvalidAttempts: true,
  };
}

function askDeliveryDate(category: string): BotProcessResult {
  return {
    reply: `Great! You are looking for *${category}*. 🗓️\nPlease share your *delivery date* in DD-MM-YYYY format (for example 24-07-2026).`,
    nextState: {
      botStep: "AWAITING_DELIVERY_DATE",
      botCategory: category,
      botDeliveryDate: null,
      botReturnDate: null,
      botSize: null,
      botColour: null,
    },
    sendHandover: false,
    resetInvalidAttempts: true,
  };
}

function startBookingFlow(category: string | null): BotProcessResult {
  if (category) return askDeliveryDate(category);
  return {
    reply:
      "We'd love to help with your booking. 👗\nWhich category are you looking for?\n(e.g. Lehenga, Sherwani, Gown, Saree, Jewellery)",
    quickReplyButtons: QUICK_CATEGORY_BUTTONS,
    nextState: {
      botStep: "AWAITING_CATEGORY",
      botCategory: null,
    },
    sendHandover: false,
    resetInvalidAttempts: true,
  };
}

function processFlowStep(
  text: string,
  state: BotConversationState,
  settings: WhatsAppBotSettings,
): BotProcessResult {
  const trimmed = text.trim();

  switch (state.botStep) {
    case "AWAITING_CATEGORY": {
      const quick = resolveQuickReply(trimmed);
      if (quick && quick !== "__start_booking__" && quick !== "__price__" && quick !== "__location__") {
        return askDeliveryDate(quick);
      }
      const category = extractCategory(text);
      if (category) return askDeliveryDate(category);
      return {
        reply: "Please tell us the category you need (e.g. Lehenga, Sherwani, Gown, Jewellery).",
        quickReplyButtons: QUICK_CATEGORY_BUTTONS,
        nextState: {},
        sendHandover: false,
        incrementInvalidAttempts: true,
      };
    }
    case "AWAITING_DELIVERY_DATE": {
      const parsed = parseCustomerDate(trimmed);
      if (!parsed.ok || isDateBeforeToday(parsed.iso)) {
        return {
          reply: DATE_INVALID_MSG,
          nextState: {},
          sendHandover: false,
          incrementInvalidAttempts: true,
        };
      }
      return {
        reply: `Delivery date noted: ${formatDisplayDate(parsed.iso)}.\nPlease share your *return date* in DD-MM-YYYY format.`,
        nextState: {
          botStep: "AWAITING_RETURN_DATE",
          botDeliveryDate: parsed.iso,
        },
        sendHandover: false,
        resetInvalidAttempts: true,
      };
    }
    case "AWAITING_RETURN_DATE": {
      const parsed = parseCustomerDate(trimmed);
      if (!parsed.ok) {
        return {
          reply: DATE_INVALID_MSG,
          nextState: {},
          sendHandover: false,
          incrementInvalidAttempts: true,
        };
      }
      if (state.botDeliveryDate && parsed.iso < state.botDeliveryDate) {
        return {
          reply: "Return date cannot be earlier than the delivery date. Please enter a valid return date in DD-MM-YYYY format.",
          nextState: {},
          sendHandover: false,
          incrementInvalidAttempts: true,
        };
      }
      if (isDateBeforeToday(parsed.iso)) {
        return {
          reply: DATE_INVALID_MSG,
          nextState: {},
          sendHandover: false,
          incrementInvalidAttempts: true,
        };
      }
      return {
        reply: "Please share your *size* (for example 38, 40, 42, or Free Size).",
        nextState: {
          botStep: "AWAITING_SIZE",
          botReturnDate: parsed.iso,
        },
        sendHandover: false,
        resetInvalidAttempts: true,
      };
    }
    case "AWAITING_SIZE": {
      if (!trimmed || trimmed.length > 30) {
        return {
          reply: "Please share your size (for example 38, 40, 42, or Free Size).",
          nextState: {},
          sendHandover: false,
          incrementInvalidAttempts: true,
        };
      }
      return {
        reply: "What is your preferred *colour*? You can also reply *Any*.",
        nextState: {
          botStep: "AWAITING_COLOUR",
          botSize: trimmed,
        },
        sendHandover: false,
        resetInvalidAttempts: true,
      };
    }
    case "AWAITING_COLOUR": {
      const colour = trimmed || "Any";
      const next: BotConversationState = {
        ...state,
        botColour: colour,
        botStep: "READY_FOR_STAFF",
        botMode: "NEEDS_STAFF",
      };
      const summary = buildEnquirySummary(next);
      const closing = settings.bookingCompleteReply;
      const reply = `${summary}\n\n${closing}`;
      if (FORBIDDEN_CONFIRMATION.test(reply)) {
        throw new Error("Bot reply contains forbidden booking confirmation wording");
      }
      return {
        reply,
        nextState: {
          botColour: colour,
          botStep: "READY_FOR_STAFF",
          botMode: "NEEDS_STAFF",
        },
        sendHandover: false,
        resetInvalidAttempts: true,
      };
    }
    default:
      return { reply: null, nextState: {}, sendHandover: false };
  }
}

export function processBotInbound(args: {
  text: string;
  messageType: string;
  isFirstContact: boolean;
  shouldSendWelcome?: boolean;
  daysSinceLastInbound?: number | null;
  state: BotConversationState;
  settings: WhatsAppBotSettings;
}): BotProcessResult {
  const { text, messageType, isFirstContact, state, settings } = args;

  if (state.botMode === "TEAM_HANDLING" || state.botMode === "NEEDS_STAFF") {
    return { reply: null, nextState: {}, sendHandover: false };
  }

  if (
    args.shouldSendWelcome &&
    shouldSendAutoWelcome({
      isFirstContact,
      daysSinceLastInbound: args.daysSinceLastInbound ?? null,
      botMode: state.botMode,
      botStep: state.botStep,
      settings,
    })
  ) {
    return buildAutoWelcomeResult(settings);
  }

  const isTextLike = messageType === "text" || messageType === "interactive";
  if (!isTextLike) {
    const ack =
      `Thank you, we've received your message. 🙏 Our team will review it and reply to you shortly.` +
      (settings.phone ? `\nFor anything urgent, call us at ${settings.phone}.` : "");
    return { reply: ack, nextState: {}, sendHandover: false };
  }

  const quick = resolveQuickReply(text.trim());
  if (quick === "__price__") {
    return { reply: settings.priceReply, nextState: {}, sendHandover: false, resetInvalidAttempts: true };
  }
  if (quick === "__location__") {
    const rule = buildKeywordRules(settings).find((r) => r.id === "location")!;
    return { reply: rule.buildReply(settings), nextState: {}, sendHandover: false, resetInvalidAttempts: true };
  }
  if (quick === "__start_booking__") {
    return startBookingFlow(null);
  }
  if (quick && quick !== "__price__" && quick !== "__location__" && quick !== "__start_booking__") {
    return askDeliveryDate(quick);
  }

  if (isHandoverIntent(text)) {
    return handoverResult(settings, state);
  }

  const inFlow = state.botStep !== "IDLE" && state.botStep !== "READY_FOR_STAFF";
  if (inFlow && settings.flowEnabled) {
    const flowResult = processFlowStep(text, state, settings);
    if (flowResult.incrementInvalidAttempts) {
      const attempts = state.botInvalidAttempts + 1;
      if (attempts >= settings.maxInvalidResponses) {
        return handoverResult(settings, state);
      }
      flowResult.nextState = { ...flowResult.nextState, botInvalidAttempts: attempts };
    }
    return flowResult;
  }

  if (settings.flowEnabled) {
    const category = extractCategory(text);
    if (category && isBookingIntent(text)) {
      return askDeliveryDate(category);
    }
    if (isBookingIntent(text)) {
      return startBookingFlow(null);
    }
  }

  const matched = matchKeywordRule(text, settings);
  if (matched) {
    if (matched.id === "staff") {
      return handoverResult(settings, state);
    }
    const reply = matched.buildReply(settings);
    const result: BotProcessResult = {
      reply,
      nextState: {},
      sendHandover: false,
      resetInvalidAttempts: true,
    };
    if (matched.id === "greeting" && settings.flowEnabled) {
      result.quickReplyButtons = QUICK_WELCOME_BUTTONS;
    }
    return result;
  }

  if (isFirstContact) {
    return {
      reply:
        `Thank you for messaging ${settings.shopName}! 🙏\n` +
        "Please share the outfit/jewellery you're looking for and your function date, and our team will help you right away.",
      nextState: {},
      sendHandover: false,
    };
  }

  const attempts = state.botInvalidAttempts + 1;
  if (attempts >= settings.maxInvalidResponses) {
    return handoverResult(settings, state);
  }

  const fallback =
    `Thank you for messaging ${settings.shopName}! 🙏\n` +
    "Our team will reply to you very shortly. Meanwhile, please share the item you're looking for and your function date so we can help you faster.";

  return {
    reply: fallback,
    nextState: { botInvalidAttempts: attempts },
    sendHandover: false,
  };
}

export function botBadgeLabel(state: Pick<BotConversationState, "botMode" | "botStep">): string {
  if (state.botMode === "TEAM_HANDLING") return "Team Handling";
  if (state.botStep === "READY_FOR_STAFF") return "Booking Enquiry Complete";
  if (state.botMode === "NEEDS_STAFF") return "Needs Staff";
  if (state.botMode === "ACTIVE") return "Bot Active";
  return "Bot Active";
}

export { BUSINESS_TIMEZONE, DATE_INVALID_MSG, QUICK_WELCOME_BUTTONS, QUICK_CATEGORY_BUTTONS };

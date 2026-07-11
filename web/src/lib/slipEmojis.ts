/** Every emoji used in Puppeteer-rendered slip templates (booking, delivery, return, incomplete). */
export const SLIP_EMOJI_CHARS = [
  "📍",
  "📞",
  "👤",
  "💬",
  "🏛️",
  "👨‍💼",
  "📅",
  "📦",
  "🔄",
  "🔒",
  "💡",
  "⚠️",
  "⚠",
  "🗓️",
  "🚚",
  "📋",
  "✅",
] as const;

export type SlipEmojiChar = (typeof SLIP_EMOJI_CHARS)[number];

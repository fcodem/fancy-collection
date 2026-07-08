import { formatDate, parseDate } from "@/lib/constants";
import { WARNING_BOOKED_ON_RETURN, WARNING_RETURNING_ON_DELIVERY } from "@/lib/bookingDetails";

/**
 * Pure, deterministic natural-language layer for the AI Booking Assistant.
 *
 * This module NEVER decides availability. It only:
 *   1. Parses a natural-language query into a structured request (dates, item, booking, intent).
 *   2. Derives new date ranges for extend / move requests from existing booking fields.
 *   3. Maps the output of the EXISTING availability engine (getAvailableItemsApi /
 *      checkItemAvailabilityForDates in web/src/lib/booking.ts) into a structured answer.
 *
 * Because it has no side effects and no DB access, every branch here is unit-testable.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AssistantIntent = "availability" | "extend" | "move";

export type DateRange = { delivery: string; return: string };

export type ParsedQuery = {
  intent: AssistantIntent;
  itemQuery: string | null;
  sku: string | null;
  bookingRef: number | null;
  customerName: string | null;
  range: DateRange | null;
  extendDays: number | null;
  moveTo: string | null;
  error: string | null;
};

/** Minimal booking shape needed to derive extend / move ranges. */
export type BookingDates = {
  deliveryDate: Date | string;
  returnDate: Date | string;
};

export type AssistantStatus =
  | "available"
  | "available_with_warning"
  | "not_available"
  | "not_found"
  | "needs_info";

export type AssistantWarning = {
  type: "returning_on_delivery" | "booked_on_return" | "jewellery_parts";
  message: string;
  booking?: {
    booking_id?: number;
    serial_no?: number;
    customer?: string;
    delivery_date?: string;
    return_date?: string;
  };
};

export type AssistantConflict = {
  booking_id?: number;
  serial_no?: number;
  customer?: string;
  dress?: string;
  delivery_date?: string;
  return_date?: string;
  reason: string;
};

export type AssistantSuggestion = {
  id: number;
  display_name: string;
  category: string;
  sku: string;
};

export type AssistantItemAnswer = {
  status: Exclude<AssistantStatus, "not_found" | "needs_info">;
  item: { id: number; display_name: string; sku: string; category: string };
  range: DateRange;
  headline: string;
  warnings: AssistantWarning[];
  conflict: AssistantConflict | null;
  suggestions: AssistantSuggestion[];
  notes: string[];
};

/** Shapes borrowed from the existing engine output (getAvailableItemsApi). */
export type EngineWarningRecord = {
  booking_id?: number;
  serial_no?: number;
  customer_name?: string;
  customer?: string;
  delivery_date?: string;
  return_date?: string;
};

export type EngineFreeItem = {
  id: number;
  name?: string;
  display_name?: string;
  sku?: string;
  category?: string;
  item_type?: string;
  booked_parts?: string[];
  available_parts?: string[];
  returning_warning?: EngineWarningRecord | null;
  booked_warning?: EngineWarningRecord | null;
};

export type EngineResult = {
  free_items: EngineFreeItem[];
  returning_on_delivery?: unknown[];
  booked_on_return?: unknown[];
};

/** Shape of checkItemAvailabilityForDates().blocking_booking (existing engine). */
export type EngineBlockingBooking = {
  booking_id?: number;
  serial_no?: number;
  customer?: string;
  delivery_date?: string;
  return_date?: string;
} | null;

// ---------------------------------------------------------------------------
// Date parsing helpers
// ---------------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

const MONTH_PATTERN =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t)?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";

const NUMBER_WORDS: Record<string, number> = {
  a: 1, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fourteen: 14,
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isoOf(year: number, monthIdx: number, day: number): string {
  return `${year}-${pad2(monthIdx + 1)}-${pad2(day)}`;
}

function addDaysIso(iso: string, days: number): string {
  const d = parseDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return formatDate(d, "iso");
}

function diffDays(fromIso: string, toIso: string): number {
  const a = parseDate(fromIso).getTime();
  const b = parseDate(toIso).getTime();
  return Math.round((b - a) / 86_400_000);
}

function dayOfWeekUtc(iso: string): number {
  return parseDate(iso).getUTCDay(); // 0 = Sunday .. 6 = Saturday
}

/** Choose the year for a bare day/month so the date is not in the past relative to today. */
function inferForwardYear(monthIdx: number, day: number, todayIso: string): number {
  const today = parseDate(todayIso);
  let year = today.getUTCFullYear();
  const candidate = isoOf(year, monthIdx, day);
  if (candidate < todayIso) year += 1;
  return year;
}

type PartialDate = { day: number; monthIdx: number | null; year: number | null };

function normalizeMonth(token: string): number | null {
  const key = token.toLowerCase();
  if (key in MONTHS) return MONTHS[key];
  const short = key.slice(0, 3);
  return short in MONTHS ? MONTHS[short] : null;
}

function resolvePartial(p: PartialDate, todayIso: string, fallback?: PartialDate): string | null {
  const monthIdx = p.monthIdx ?? fallback?.monthIdx ?? null;
  if (monthIdx == null) return null;
  const year = p.year ?? fallback?.year ?? inferForwardYear(monthIdx, p.day, todayIso);
  if (p.day < 1 || p.day > 31) return null;
  return isoOf(year, monthIdx, p.day);
}

/**
 * Extract a delivery/return date range from free text, resolved against `todayIso`.
 * Returns { range, error }. A single date yields delivery === return (a one-day booking).
 */
export function extractDateRange(
  text: string,
  todayIso: string,
): { range: DateRange | null; error: string | null } {
  const lower = text.toLowerCase();

  // Explicit calendar dates always win over relative phrases.
  const hasExplicit =
    /\d{4}-\d{2}-\d{2}/.test(lower) || new RegExp(`\\b(?:${MONTH_PATTERN})\\b`, "i").test(lower);

  // Relative phrases -------------------------------------------------------
  if (!hasExplicit) {
    if (/\bday after tomorrow\b/.test(lower)) {
      const d = addDaysIso(todayIso, 2);
      return { range: { delivery: d, return: d }, error: null };
    }
    if (/\btomorrow\b/.test(lower)) {
      const d = addDaysIso(todayIso, 1);
      return { range: { delivery: d, return: d }, error: null };
    }
    if (/\b(today|tonight)\b/.test(lower)) {
      return { range: { delivery: todayIso, return: todayIso }, error: null };
    }
    const weekend = /\b(this|next|coming)?\s*weekend\b/.exec(lower);
    if (weekend) {
      const dow = dayOfWeekUtc(todayIso);
      let daysUntilSat = (6 - dow + 7) % 7;
      if (weekend[1] === "next") daysUntilSat += 7;
      const sat = addDaysIso(todayIso, daysUntilSat);
      return { range: { delivery: sat, return: addDaysIso(sat, 1) }, error: null };
    }
  }

  // Explicit ISO dates -----------------------------------------------------
  const isoMatches = lower.match(/\d{4}-\d{2}-\d{2}/g);
  if (isoMatches && isoMatches.length >= 1) {
    const delivery = isoMatches[0];
    const ret = isoMatches[1] ?? isoMatches[0];
    return finalizeRange(delivery, ret);
  }

  // "20 to 23 July" (shared trailing month) -------------------------------
  const sharedMonth = new RegExp(
    `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:to|till|until|through|-|–|—)\\s*(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_PATTERN})(?:\\s*,?\\s*(\\d{4}))?`,
    "i",
  ).exec(lower);
  if (sharedMonth) {
    const monthIdx = normalizeMonth(sharedMonth[3]);
    if (monthIdx != null) {
      const year = sharedMonth[4] ? Number(sharedMonth[4]) : null;
      const d1 = resolvePartial({ day: Number(sharedMonth[1]), monthIdx, year }, todayIso);
      const d2 = resolvePartial({ day: Number(sharedMonth[2]), monthIdx, year }, todayIso);
      if (d1 && d2) return finalizeRange(d1, d2);
    }
  }

  // "July 20 to 23" (shared leading month) --------------------------------
  const leadMonth = new RegExp(
    `\\b(${MONTH_PATTERN})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:to|till|until|through|-|–|—)\\s*(\\d{1,2})(?:st|nd|rd|th)?`,
    "i",
  ).exec(lower);
  if (leadMonth) {
    const monthIdx = normalizeMonth(leadMonth[1]);
    if (monthIdx != null) {
      const d1 = resolvePartial({ day: Number(leadMonth[2]), monthIdx, year: null }, todayIso);
      const d2 = resolvePartial({ day: Number(leadMonth[3]), monthIdx, year: null }, todayIso);
      if (d1 && d2) return finalizeRange(d1, d2);
    }
  }

  // General: collect all "day month" / "month day" tokens in order --------
  const found = collectDates(lower, todayIso);
  if (found.length >= 2) return finalizeRange(found[0], found[1]);
  if (found.length === 1) return { range: { delivery: found[0], return: found[0] }, error: null };

  return { range: null, error: null };
}

function collectDates(lower: string, todayIso: string): string[] {
  type Hit = { index: number; iso: string };
  const hits: Hit[] = [];

  const dayMonth = new RegExp(
    `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_PATTERN})(?:\\s*,?\\s*(\\d{4}))?`,
    "gi",
  );
  const monthDay = new RegExp(
    `\\b(${MONTH_PATTERN})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*,?\\s*(\\d{4}))?`,
    "gi",
  );

  let m: RegExpExecArray | null;
  while ((m = dayMonth.exec(lower)) !== null) {
    const monthIdx = normalizeMonth(m[2]);
    if (monthIdx == null) continue;
    const iso = resolvePartial(
      { day: Number(m[1]), monthIdx, year: m[3] ? Number(m[3]) : null },
      todayIso,
    );
    if (iso) hits.push({ index: m.index, iso });
  }
  while ((m = monthDay.exec(lower)) !== null) {
    const monthIdx = normalizeMonth(m[1]);
    if (monthIdx == null) continue;
    const iso = resolvePartial(
      { day: Number(m[2]), monthIdx, year: m[3] ? Number(m[3]) : null },
      todayIso,
    );
    if (iso && !hits.some((h) => Math.abs(h.index - m!.index) <= 2)) {
      hits.push({ index: m.index, iso });
    }
  }

  return hits
    .sort((a, b) => a.index - b.index)
    .map((h) => h.iso)
    .filter((iso, i, arr) => arr.indexOf(iso) === i);
}

function finalizeRange(delivery: string, ret: string): { range: DateRange | null; error: string | null } {
  if (ret < delivery) {
    return { range: null, error: "The return date is before the pickup date." };
  }
  return { range: { delivery, return: ret }, error: null };
}

// ---------------------------------------------------------------------------
// Entity extraction
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  "is", "are", "the", "a", "an", "available", "free", "booked", "book", "booking",
  "for", "from", "to", "on", "during", "between", "can", "i", "we", "will", "be",
  "check", "if", "was", "this", "that", "next", "coming", "weekend", "tomorrow",
  "today", "tonight", "by", "day", "days", "night", "nights", "extend", "extended",
  "move", "moved", "moving", "reschedule", "rescheduled", "postpone", "postponed",
  "shift", "shifted", "conflict", "conflicts", "any", "does", "do", "have", "get",
  "reserve", "reserved", "rent", "rental", "dress", "item", "serial", "no", "number",
  "customer", "please", "want", "need", "still", "when", "and", "or", "of", "with",
  "would", "there", "it", "me", "my", "his", "her", "till", "until", "through", "as",
  "same", "period", "dates", "date", "range", "instead", "how", "about", "what",
  "whats", "show", "tell", "which", "ones", "one",
]);

function stripOrdinals(s: string): string {
  return s.replace(/\b(\d{1,2})(?:st|nd|rd|th)\b/g, "$1");
}

/** Best-effort dress phrase: query minus dates, refs, skus, and stopwords. */
function extractItemQuery(original: string, sku: string | null, bookingRef: number | null): string | null {
  let s = " " + original.toLowerCase() + " ";
  s = stripOrdinals(s);
  // Remove booking / serial references.
  s = s.replace(/#\s*\d+/g, " ");
  s = s.replace(/\b(?:booking|serial|record|order)\s*(?:no\.?|number|#)?\s*\d+/gi, " ");
  // Remove SKU token.
  if (sku) s = s.replace(new RegExp(sku.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&"), "gi"), " ");
  // Remove date-ish tokens.
  s = s.replace(new RegExp(`\\b\\d{1,2}\\s+(?:${MONTH_PATTERN})(?:\\s*,?\\s*\\d{4})?`, "gi"), " ");
  s = s.replace(new RegExp(`\\b(?:${MONTH_PATTERN})\\s+\\d{1,2}(?:\\s*,?\\s*\\d{4})?`, "gi"), " ");
  s = s.replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ");
  s = s.replace(/\b\d+\b/g, " ");
  // Remove customer phrase "for <Name>" handled elsewhere; drop leftover punctuation.
  s = s.replace(/[?.!,;:'"()]/g, " ");

  const words = s
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .filter((w) => !STOPWORDS.has(w));

  const phrase = words.join(" ").trim();
  return phrase.length ? phrase : null;
}

const MONTH_NAME_SET = new Set(Object.keys(MONTHS));
const WEEKDAY_SET = new Set([
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
]);

/** Extract an explicit customer name from patterns like "for Priya" / "customer Rahul Sharma". */
function extractCustomerName(original: string): string | null {
  const patterns = [
    /\bcustomer(?:\s+named)?\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/,
    /\bbooked by\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/,
    /\bfor\s+(?:mr\.?|mrs\.?|ms\.?|miss)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/i,
    /\b([A-Z][a-zA-Z]+)'s\s+booking\b/,
  ];
  for (const re of patterns) {
    const m = re.exec(original);
    if (m) {
      const name = m[1].trim();
      const first = name.split(/\s+/)[0].toLowerCase();
      if (!MONTH_NAME_SET.has(first) && !WEEKDAY_SET.has(first)) return name;
    }
  }
  return null;
}

function extractExtendDays(lower: string): number | null {
  const m = /\bby\s+(\d+|a|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fourteen)\s*(?:day|days|night|nights)\b/.exec(lower);
  if (!m) return null;
  const token = m[1];
  if (/^\d+$/.test(token)) return Number(token);
  return NUMBER_WORDS[token] ?? null;
}

// ---------------------------------------------------------------------------
// Query parser (main entry)
// ---------------------------------------------------------------------------

export function parseAssistantQuery(query: string, todayIso: string): ParsedQuery {
  const original = (query || "").trim();
  const lower = original.toLowerCase();

  // Booking reference: #145 / booking 145 / serial no 145.
  let bookingRef: number | null = null;
  const hashRef = /#\s*(\d+)/.exec(original);
  const wordRef = /\b(?:booking|serial|record|order)\s*(?:no\.?|number|#)?\s*(\d+)/i.exec(original);
  if (hashRef) bookingRef = Number(hashRef[1]);
  else if (wordRef) bookingRef = Number(wordRef[1]);

  // SKU like LR-102 / SW-12.
  const skuMatch = /\b([a-z]{1,6}-\d{1,6})\b/i.exec(original);
  const sku = skuMatch ? skuMatch[1].toUpperCase() : null;

  // Intent.
  const isExtend = /\bextend|\blengthen|\badd\s+\d+\s*(?:day|days|night|nights)/.test(lower);
  const isMove = /\b(move|moved|moving|reschedul|postpone|shift|shifted)\b/.test(lower) ||
    (/\bconflict/.test(lower) && /\bto\b/.test(lower) && bookingRef != null && !isExtend);

  let intent: AssistantIntent = "availability";
  if (isExtend) intent = "extend";
  else if (isMove) intent = "move";

  const extendDays = intent === "extend" ? extractExtendDays(lower) : null;

  // Dates.
  const { range, error } = extractDateRange(original, todayIso);

  // For a move, the target date is the (single) parsed date.
  const moveTo = intent === "move" && range ? range.delivery : null;

  const customerName = extractCustomerName(original);
  const itemQuery = extractItemQuery(original, sku, bookingRef);

  return {
    intent,
    itemQuery,
    sku,
    bookingRef,
    customerName,
    // For extend/move the working range comes from the booking, not the query.
    range: intent === "availability" ? range : null,
    extendDays,
    moveTo,
    error,
  };
}

// ---------------------------------------------------------------------------
// Range derivation for extend / move (pure)
// ---------------------------------------------------------------------------

function toIso(d: Date | string): string {
  return formatDate(d, "iso");
}

/** Extend keeps the pickup date and pushes the return date out by N days. */
export function computeExtendedRange(booking: BookingDates, extendDays: number): DateRange {
  const delivery = toIso(booking.deliveryDate);
  const currentReturn = toIso(booking.returnDate);
  return { delivery, return: addDaysIso(currentReturn, extendDays) };
}

/** Move shifts the pickup to `moveToIso` and preserves the original rental duration. */
export function computeMovedRange(booking: BookingDates, moveToIso: string): DateRange {
  const duration = diffDays(toIso(booking.deliveryDate), toIso(booking.returnDate));
  return { delivery: moveToIso, return: addDaysIso(moveToIso, Math.max(0, duration)) };
}

// ---------------------------------------------------------------------------
// Answer mapping from engine output (pure — the single classification authority)
// ---------------------------------------------------------------------------

function warningBooking(rec: EngineWarningRecord) {
  return {
    booking_id: rec.booking_id,
    serial_no: rec.serial_no,
    customer: rec.customer_name || rec.customer,
    delivery_date: rec.delivery_date,
    return_date: rec.return_date,
  };
}

function serialLabel(serial?: number): string {
  return serial == null ? "" : `Serial #${pad2(serial)}`;
}

export type MapAvailabilityArgs = {
  item: { id: number; display_name?: string; name?: string; sku?: string; category?: string };
  range: DateRange;
  engine: EngineResult;
  /** blocking_booking from checkItemAvailabilityForDates(), only needed when blocked. */
  blocking?: EngineBlockingBooking;
  intentLabel?: string;
  todayIso?: string;
};

/**
 * Map the existing engine's output for one resolved item into a structured answer.
 * Availability decisions come ONLY from `engine`/`blocking`; this never re-derives overlap.
 */
export function mapAvailability(args: MapAvailabilityArgs): AssistantItemAnswer {
  const { item, range, engine, blocking, todayIso } = args;
  const found = engine.free_items.find((f) => f.id === item.id) || null;

  const display = item.display_name || item.name || "Dress";
  const itemInfo = {
    id: item.id,
    display_name: display,
    sku: item.sku || found?.sku || "",
    category: item.category || found?.category || "",
  };

  const warnings: AssistantWarning[] = [];
  const notes: string[] = [];
  if (todayIso && range.delivery < todayIso) {
    notes.push("These dates are in the past; showing the engine result as-is (historical).");
  }

  if (found) {
    if (found.returning_warning) {
      const w = found.returning_warning;
      warnings.push({
        type: "returning_on_delivery",
        message: `${WARNING_RETURNING_ON_DELIVERY}: ${serialLabel(w.serial_no)}${
          w.customer_name || w.customer ? ` (${w.customer_name || w.customer})` : ""
        } is returning on your pickup day${w.return_date ? ` — it returns ${w.return_date}` : ""}.`,
        booking: warningBooking(w),
      });
    }
    if (found.booked_warning) {
      const w = found.booked_warning;
      warnings.push({
        type: "booked_on_return",
        message: `${WARNING_BOOKED_ON_RETURN}: ${serialLabel(w.serial_no)}${
          w.customer_name || w.customer ? ` (${w.customer_name || w.customer})` : ""
        } is picked up on your return day${
          w.delivery_date ? ` — it is booked ${w.delivery_date}${w.return_date ? ` → ${w.return_date}` : ""}` : ""
        }.`,
        booking: warningBooking(w),
      });
    }
    if ((found.booked_parts?.length ?? 0) > 0) {
      warnings.push({
        type: "jewellery_parts",
        message: `Some jewellery parts are booked in another record (${found.booked_parts!.join(", ")}); remaining parts are free${
          found.available_parts?.length ? `: ${found.available_parts.join(", ")}` : ""
        }.`,
      });
    }

    const status = warnings.length ? "available_with_warning" : "available";
    return {
      status,
      item: itemInfo,
      range,
      headline:
        status === "available"
          ? `${display} is Available for ${range.delivery} → ${range.return}.`
          : `${display} is Available with a scheduling warning for ${range.delivery} → ${range.return}.`,
      warnings,
      conflict: null,
      suggestions: [],
      notes,
    };
  }

  // Absent from free_items → engine considers it blocked for this range.
  const conflict: AssistantConflict = {
    booking_id: blocking?.booking_id,
    serial_no: blocking?.serial_no,
    customer: blocking?.customer,
    dress: display,
    delivery_date: blocking?.delivery_date,
    return_date: blocking?.return_date,
    reason: blocking
      ? `Already booked${blocking.serial_no != null ? ` on ${serialLabel(blocking.serial_no)}` : ""}${
          blocking.delivery_date ? ` (${blocking.delivery_date} → ${blocking.return_date})` : ""
        }.`
      : "Not available for the requested dates.",
  };

  const suggestions = suggestSimilar(engine, itemInfo.category, item.id);

  return {
    status: "not_available",
    item: itemInfo,
    range,
    headline: `${display} is Not Available for ${range.delivery} → ${range.return}.`,
    warnings,
    conflict,
    suggestions,
    notes,
  };
}

/** Similar available dresses from the SAME engine result (no extra queries). */
function suggestSimilar(engine: EngineResult, category: string, excludeId: number): AssistantSuggestion[] {
  return engine.free_items
    .filter(
      (f) =>
        f.id !== excludeId &&
        (!category || f.category === category) &&
        !f.returning_warning &&
        !f.booked_warning &&
        (f.booked_parts?.length ?? 0) === 0,
    )
    .slice(0, 3)
    .map((f) => ({
      id: f.id,
      display_name: f.display_name || f.name || "Dress",
      category: f.category || "",
      sku: f.sku || "",
    }));
}

/** Combine per-item statuses into a single worst-case status. */
export function combineStatus(answers: AssistantItemAnswer[]): AssistantStatus {
  if (!answers.length) return "not_found";
  if (answers.some((a) => a.status === "not_available")) return "not_available";
  if (answers.some((a) => a.status === "available_with_warning")) return "available_with_warning";
  return "available";
}

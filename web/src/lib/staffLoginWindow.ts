import { BUSINESS_TIMEZONE } from "./constants";

/** Shop daytime window when staff may sign in without owner approval (IST). */
export const STAFF_OPEN_LOGIN_START_HOUR = 10; // 10:00 AM inclusive
export const STAFF_OPEN_LOGIN_END_HOUR = 21; // 9:00 PM exclusive (needs approval from 9 PM)

/** Current hour 0–23 in the business timezone. */
export function businessHourNow(now = new Date()): number {
  const hourStr = new Intl.DateTimeFormat("en-GB", {
    timeZone: BUSINESS_TIMEZONE,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(now);
  return Number.parseInt(hourStr, 10);
}

/**
 * Staff can log in freely during daytime (10 AM–9 PM IST).
 * Outside that window, owner approval is required.
 * Owners are never gated by this helper.
 */
export function staffLoginNeedsOwnerApproval(now = new Date()): boolean {
  const hour = businessHourNow(now);
  if (!Number.isFinite(hour)) return true;
  return hour < STAFF_OPEN_LOGIN_START_HOUR || hour >= STAFF_OPEN_LOGIN_END_HOUR;
}

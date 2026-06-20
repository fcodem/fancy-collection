/** Strip non-digits from a phone string. */
export function digitsOnly(phone: string): string {
  return (phone || "").replace(/\D/g, "");
}

/** Normalize Indian mobiles to E.164 (+91XXXXXXXXXX). */
export function normalizeIndianPhone(phone: string): string | null {
  let digits = digitsOnly(phone);
  if (digits.length === 10) digits = `91${digits}`;
  if (digits.startsWith("0") && digits.length === 11) digits = `91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return null;
}

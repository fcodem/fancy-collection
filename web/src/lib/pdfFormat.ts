import { formatInr } from "./format";

/** ASCII-safe INR for jsPDF (Helvetica cannot render ₹ or ✓). */
export function pdfCurrency(n: number | string | null | undefined): string {
  return `Rs. ${formatInr(n)}`;
}

export function pdfPaidLabel(): string {
  return "Paid";
}

/** Strip/replace characters that break in standard PDF fonts. Preserves line breaks. */
export function sanitizePdfText(value: string): string {
  return value
    .replace(/\u20B9/g, "Rs. ")
    .replace(/₹/g, "Rs. ")
    .replace(/[\u2713\u2714\u2705\u2717]/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .trim();
}

/** Shorter PDF column titles to avoid awkward header wrapping. */
export const PDF_HEADER_LABELS: Record<string, string> = {
  "Total Rent": "Rent",
  "Balance Left": "Balance",
  "Dress Notes": "Dress Notes",
  "Common Note": "Common",
  "Security Held": "Sec. Held",
  "Returned On": "Returned",
  "Delivery Info": "Deliv. Info",
  "Return Date/Time": "Return",
  "Delivery Date/Time": "Delivery",
  "Returning Dress Notes": "Ret. Notes",
  "Returning Common Note": "Ret. Common",
  "Next Dress Notes": "Next Notes",
  "Next Common Note": "Next Common",
  "Returning Customer": "Returning",
  "Next Customer": "Next Cust.",
  "Returning Dresses": "Ret. Dress",
  "Next Dresses": "Next Dress",
  "Returning Contact": "Ret. Phone",
  "Next Contact": "Next Phone",
  "Missing Notes": "Missing",
  "Packing Note": "Pack Note",
  "Prepared By": "Prepared",
  "Checked By": "Checked",
};

export function pdfHeaderLabel(header: string): string {
  return PDF_HEADER_LABELS[header.trim()] ?? header;
}

const MONEY_HEADERS = new Set([
  "Rent",
  "Total Rent",
  "Advance",
  "Balance",
  "Balance Left",
  "Remaining",
  "Security",
  "Sec. Held",
  "Security Held",
]);

export function isPdfMoneyColumn(header: string): boolean {
  return MONEY_HEADERS.has(header.trim()) || MONEY_HEADERS.has(pdfHeaderLabel(header));
}

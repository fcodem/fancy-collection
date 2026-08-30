/** Count body variable slots {{1}}, {{2}}, … in a Meta template body. */
export function countBodyTemplateVars(bodyText: string): number {
  const matches = bodyText.match(/\{\{\s*(\d+)\s*\}\}/g);
  if (!matches?.length) return 0;
  let max = 0;
  for (const m of matches) {
    const n = parseInt(m.replace(/\D/g, ""), 10);
    if (n > max) max = n;
  }
  return max;
}

export function templateBodyText(
  components?: Array<{ type?: string; text?: string }>,
): string {
  const body = (components || []).find((c) => String(c.type).toUpperCase() === "BODY");
  return body?.text || "";
}

export function templateHeaderFormat(
  components?: Array<{ type?: string; format?: string }>,
): "IMAGE" | "VIDEO" | "DOCUMENT" | "TEXT" | "NONE" {
  const header = (components || []).find((c) => String(c.type).toUpperCase() === "HEADER");
  const format = String(header?.format || "").toUpperCase();
  if (format === "IMAGE" || format === "VIDEO" || format === "DOCUMENT" || format === "TEXT") {
    return format;
  }
  return header ? "TEXT" : "NONE";
}

/** Build ordered body params for Meta (1-based slots). */
export function buildBodyParamsForSlots(
  slotCount: number,
  staticVars: string[],
  recipientName?: string,
  useNameForSlot1 = true,
): string[] {
  const params: string[] = [];
  for (let i = 1; i <= slotCount; i++) {
    if (i === 1 && useNameForSlot1) {
      params.push((recipientName || "Customer").slice(0, 1024));
    } else {
      params.push((staticVars[i - 1] || "").slice(0, 1024));
    }
  }
  return params;
}

/** Fill {{n}} placeholders for live preview (sample name for {{1}}). */
export function renderTemplateBodyPreview(
  bodyText: string,
  bodyVariables: string[],
  sampleName = "Priya",
  useNameForVar1 = true,
): string {
  let out = bodyText;
  if (useNameForVar1 && /\{\{\s*1\s*\}\}/.test(out)) {
    out = out.replace(/\{\{\s*1\s*\}\}/g, sampleName);
  }
  const maxSlot = countBodyTemplateVars(bodyText);
  for (let slot = 1; slot <= maxSlot; slot++) {
    const value = bodyVariables[slot - 1]?.trim();
    if (!value) continue;
    if (slot === 1 && useNameForVar1) continue;
    out = out.replace(new RegExp(`\\{\\{\\s*${slot}\\s*\\}\\}`, "g"), value);
  }
  return out;
}

export function isEditableBroadcastTemplate(bodyText: string): boolean {
  const count = countBodyTemplateVars(bodyText);
  if (count === 0) return false;
  if (count === 1 && /\{\{\s*1\s*\}\}/.test(bodyText)) return false;
  return count >= 2;
}

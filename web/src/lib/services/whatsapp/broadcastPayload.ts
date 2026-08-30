export type BroadcastRecipient = { phone: string; name: string };

export type BroadcastRecipientsPayload = {
  v?: number;
  recipients: BroadcastRecipient[];
  /** Static body variable values for slots {{2}}…{{n}} ({{1}} = recipient name when enabled). */
  bodyVariables?: string[];
  /** When true, slot {{1}} is filled per recipient from their name. */
  useNameForVar1?: boolean;
  /** Meta media id from a one-time upload at broadcast start (IMAGE header). */
  headerMediaId?: string | null;
  /** Stored upload path / URL to reload flyer buffer between batches. */
  headerImagePath?: string | null;
};

export function parseBroadcastRecipientsPayload(raw: unknown): BroadcastRecipientsPayload {
  if (Array.isArray(raw)) {
    return { recipients: parseRecipientList(raw) };
  }
  if (!raw || typeof raw !== "object") {
    return { recipients: [] };
  }
  const obj = raw as Record<string, unknown>;
  return {
    v: typeof obj.v === "number" ? obj.v : undefined,
    recipients: parseRecipientList(obj.recipients),
    bodyVariables: Array.isArray(obj.bodyVariables)
      ? obj.bodyVariables.map((v) => String(v ?? ""))
      : undefined,
    useNameForVar1: obj.useNameForVar1 === true,
    headerMediaId: typeof obj.headerMediaId === "string" ? obj.headerMediaId : null,
    headerImagePath: typeof obj.headerImagePath === "string" ? obj.headerImagePath : null,
  };
}

export function parseRecipientList(raw: unknown): BroadcastRecipient[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const phone = String((row as { phone?: unknown }).phone || "").trim();
      const name = String((row as { name?: unknown }).name || "Customer").trim() || "Customer";
      return phone ? { phone, name } : null;
    })
    .filter((r): r is BroadcastRecipient => Boolean(r));
}

export function buildBroadcastRecipientsPayload(
  recipients: BroadcastRecipient[],
  opts?: {
    bodyVariables?: string[];
    useNameForVar1?: boolean;
    headerMediaId?: string | null;
    headerImagePath?: string | null;
  },
): BroadcastRecipientsPayload {
  return {
    v: 2,
    recipients,
    bodyVariables: opts?.bodyVariables,
    useNameForVar1: opts?.useNameForVar1,
    headerMediaId: opts?.headerMediaId ?? null,
    headerImagePath: opts?.headerImagePath ?? null,
  };
}

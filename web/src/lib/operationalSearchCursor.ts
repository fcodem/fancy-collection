export type OperationalSearchCursor = {
  date: string;
  time: string;
  id: number;
};

export function encodeOperationalSearchCursor(value: OperationalSearchCursor): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function decodeOperationalSearchCursor(
  raw?: string | null,
): OperationalSearchCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    ) as OperationalSearchCursor;
    if (!parsed.date || typeof parsed.time !== "string" || !Number.isInteger(parsed.id)) {
      return null;
    }
    if (Number.isNaN(new Date(parsed.date).getTime())) return null;
    return parsed;
  } catch {
    return null;
  }
}

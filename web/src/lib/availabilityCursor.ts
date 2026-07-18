export type AvailabilityCursor = {
  category: string;
  name: string;
  id: number;
};

export function encodeAvailabilityCursor(value: AvailabilityCursor): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function decodeAvailabilityCursor(raw?: string | null): AvailabilityCursor | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as AvailabilityCursor;
    if (
      typeof value.category !== "string" ||
      typeof value.name !== "string" ||
      !Number.isInteger(value.id)
    ) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

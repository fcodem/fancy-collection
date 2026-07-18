export type PackingCursor = { deliveryDate: string; deliveryTime: string; id: number };

export function encodePackingCursor(value: PackingCursor): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function decodePackingCursor(raw?: string | null): PackingCursor | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as PackingCursor;
    if (
      Number.isNaN(new Date(value.deliveryDate).getTime()) ||
      typeof value.deliveryTime !== "string" ||
      !Number.isInteger(value.id)
    ) return null;
    return value;
  } catch {
    return null;
  }
}

import { BRAND_ADDRESS_DEFAULT, BRAND_FULL_NAME } from "@/lib/branding";

export type WhatsAppLocationPayload = {
  kind: "location";
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
};

export function formatLocationBody(loc: Omit<WhatsAppLocationPayload, "kind">): string {
  return JSON.stringify({
    kind: "location" as const,
    latitude: loc.latitude,
    longitude: loc.longitude,
    name: loc.name,
    address: loc.address,
  });
}

export function parseLocationBody(body: string | null | undefined): WhatsAppLocationPayload | null {
  if (!body?.trim()) return null;
  try {
    const parsed = JSON.parse(body) as Partial<WhatsAppLocationPayload>;
    if (
      parsed?.kind === "location" &&
      typeof parsed.latitude === "number" &&
      typeof parsed.longitude === "number"
    ) {
      return parsed as WhatsAppLocationPayload;
    }
  } catch {
    /* not JSON location payload */
  }
  return null;
}

export function googleMapsUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}

/** Shop location for outbound "send location" in inbox. */
export function getBusinessWhatsAppLocation(): Omit<WhatsAppLocationPayload, "kind"> | null {
  const lat = Number(process.env.BUSINESS_LATITUDE);
  const lng = Number(process.env.BUSINESS_LONGITUDE);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    latitude: lat,
    longitude: lng,
    name: process.env.BUSINESS_NAME?.trim() || BRAND_FULL_NAME,
    address: process.env.BUSINESS_ADDRESS?.trim() || BRAND_ADDRESS_DEFAULT,
  };
}

export function formatInboundLocationText(opts: {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}): string {
  return formatLocationBody(opts);
}

export function formatLocationPreview(loc: WhatsAppLocationPayload): string {
  const label = loc.name || loc.address || "Shared location";
  return `📍 ${label}`;
}

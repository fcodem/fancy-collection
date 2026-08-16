import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  SALE_PROJECT_INSTAGRAM_URL,
  SALE_PROJECT_MAPS_URL,
  SALE_PROJECT_PHONES,
  SALE_PROJECT_TEMPLATE_BODY,
} from "./saleProjectTemplateCopy";

/** Meta template: SALE 1 — flyer image + men's sale collection message. */
export const SALE_1_TEMPLATE_NAME_DEFAULT = "sale_1";

export const SALE_1_FLYER_RELATIVE_PATH = "public/images/whatsapp/sale-1-flyer.png";
export const SALE_1_FLYER_PUBLIC_PATH = "/images/whatsapp/sale-1-flyer.png";
export const SALE_1_FLYER_FILENAME = "sale-1-flyer.png";

export function sale1TemplateName(): string {
  return (
    process.env.WA_TEMPLATE_MARKETING_SALE_1?.trim().toLowerCase() ||
    SALE_1_TEMPLATE_NAME_DEFAULT
  );
}

export function loadWebRelativeFile(relativePath: string): Buffer {
  return readFileSync(path.join(process.cwd(), relativePath));
}

export function sale1FlyerBuffer(): Buffer {
  return loadWebRelativeFile(SALE_1_FLYER_RELATIVE_PATH);
}

function appOrigin(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    process.env.BASE_URL?.replace(/\/$/, "") ||
    "";
  if (fromEnv) return fromEnv;
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  }
  return "https://fcmanage.vercel.app";
}

/** Candidate filesystem paths (local + Vercel traced layouts). */
export function sale1FlyerPathCandidates(): string[] {
  const cwd = process.cwd();
  return [
    path.join(cwd, SALE_1_FLYER_RELATIVE_PATH),
    path.join(cwd, "images", "whatsapp", SALE_1_FLYER_FILENAME),
    path.join(cwd, "public", "images", "whatsapp", SALE_1_FLYER_FILENAME),
    path.join(cwd, "web", SALE_1_FLYER_RELATIVE_PATH),
  ];
}

/**
 * Load the SALE 1 flyer for Meta media upload.
 * On Vercel, `public/` is often not on the serverless disk — fall back to the CDN URL.
 */
export async function loadSale1FlyerBuffer(): Promise<Buffer | null> {
  for (const candidate of sale1FlyerPathCandidates()) {
    if (existsSync(candidate)) {
      try {
        return readFileSync(candidate);
      } catch {
        // try next candidate
      }
    }
  }

  const url = `${appOrigin()}${SALE_1_FLYER_PUBLIC_PATH}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export function buildSale1TemplateComponents(headerHandle: string) {
  return [
    {
      type: "HEADER",
      format: "IMAGE",
      example: { header_handle: [headerHandle] },
    },
    {
      type: "BODY",
      text: SALE_PROJECT_TEMPLATE_BODY.slice(0, 1024),
    },
    {
      type: "FOOTER",
      text: SALE_PROJECT_PHONES.slice(0, 60),
    },
    {
      type: "BUTTONS",
      buttons: [
        {
          type: "URL",
          text: "Shop Location",
          url: SALE_PROJECT_MAPS_URL.slice(0, 2000),
        },
        {
          type: "URL",
          text: "View on Instagram",
          url: SALE_PROJECT_INSTAGRAM_URL.slice(0, 2000),
        },
      ],
    },
  ];
}

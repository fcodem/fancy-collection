import { readFileSync } from "node:fs";
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

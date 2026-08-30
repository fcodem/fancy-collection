import {
  SALE_PROJECT_INSTAGRAM_URL,
  SALE_PROJECT_MAPS_URL,
  SALE_PROJECT_PHONES,
} from "./saleProjectTemplateCopy";

/** Meta template: poster image + editable message + Maps / Instagram buttons. */
export const REUSABLE_BROADCAST_TEMPLATE_NAME = "fc_reusable_broadcast";

export const REUSABLE_BROADCAST_BODY =
  "Dear {{1}},\n\n{{2}}";

export const REUSABLE_BROADCAST_BODY_EXAMPLE = [
  "Priya",
  "Eid collection sale is live at Fancy Collection!\n\n" +
    "New bridal lehengas, sherwanis & party wear.\n\n" +
    "Visit: Near Balaji Mandir, Court Road, Moradabad.\n\n" +
    "8077843874 | 8630834711",
];

export function reusableBroadcastTemplateName(): string {
  return (
    process.env.WA_TEMPLATE_MARKETING_REUSABLE?.trim().toLowerCase() ||
    REUSABLE_BROADCAST_TEMPLATE_NAME
  );
}

export function buildReusableBroadcastTemplateComponents(headerHandle: string) {
  return [
    {
      type: "HEADER",
      format: "IMAGE",
      example: { header_handle: [headerHandle] },
    },
    {
      type: "BODY",
      text: REUSABLE_BROADCAST_BODY,
      example: { body_text: [REUSABLE_BROADCAST_BODY_EXAMPLE] },
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
          text: "Instagram",
          url: SALE_PROJECT_INSTAGRAM_URL.slice(0, 2000),
        },
      ],
    },
  ];
}

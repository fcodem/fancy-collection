import { getWhatsAppBotSettingsDefaults, type WhatsAppBotSettings } from "./botSettings";

/** Default Meta template — two URL buttons (Maps + Instagram). Immutable once approved; bump version to change. */
export const CUSTOMER_WELCOME_TEMPLATE_NAME_DEFAULT = "customer_welcome_v1";

export function customerWelcomeTemplateName(): string {
  return (
    process.env.WA_TEMPLATE_CUSTOMER_WELCOME?.trim().toLowerCase() ||
    CUSTOMER_WELCOME_TEMPLATE_NAME_DEFAULT
  );
}

export function customerWelcomeTemplateLanguage(): string {
  return process.env.WA_TEMPLATE_CUSTOMER_WELCOME_LANG?.trim() || "en";
}

/** Body text stored in inbox when the approved template is sent. */
export function customerWelcomeTemplatePreviewBody(settings: WhatsAppBotSettings): string {
  const phones = [settings.phone, settings.phone2].filter(Boolean).join(" • ");
  return (
    `Welcome to ${settings.shopName}\n\n` +
    `Namaste! We are delighted to connect with you.\n\n` +
    `Premium bridal & designer outfit rentals in Moradabad — Lehenga, Sherwani, Gown, Saree, Jewellery & more.\n\n` +
    `📍 ${settings.address}\n` +
    `🕙 Open: ${settings.hours}\n` +
    `📞 ${phones}\n\n` +
    `Buttons: Shop Location (Google Maps) • View Dress Samples (Instagram)\n\n` +
    `Please share your outfit preference and function date — our team will assist you shortly.`
  );
}

export function buildCustomerWelcomeTemplateComponents(settings: WhatsAppBotSettings) {
  const phones = [settings.phone, settings.phone2].filter(Boolean).join(" • ");

  const body =
    `Namaste! 🙏 We are delighted to connect with you.\n\n` +
    `Moradabad's trusted boutique for premium bridal & designer outfit rentals — ` +
    `Lehenga, Sherwani, Gown, Saree, Jewellery & more.\n\n` +
    `📍 ${settings.address}\n\n` +
    `🕙 Open: ${settings.hours}\n\n` +
    `📞 For further queries, contact us on:\n${phones}\n\n` +
    `Tap the buttons below for Google Maps directions or to view dress samples on Instagram.\n\n` +
    `Please share the outfit you are looking for and your function date — our team will assist you shortly. 🙏`;

  return [
    {
      type: "HEADER",
      format: "TEXT",
      text: settings.shopName.slice(0, 60),
    },
    {
      type: "BODY",
      text: body.slice(0, 1024),
    },
    {
      type: "FOOTER",
      text: phones.slice(0, 60),
    },
    {
      type: "BUTTONS",
      buttons: [
        {
          type: "URL",
          text: "Shop Location",
          url: settings.mapsUrl.slice(0, 2000),
        },
        {
          type: "URL",
          text: "View Dress Samples",
          url: settings.instagramUrl.slice(0, 2000),
        },
      ],
    },
  ];
}

export function getCustomerWelcomeTemplateDefaults() {
  const settings = getWhatsAppBotSettingsDefaults();
  return {
    name: customerWelcomeTemplateName(),
    language: customerWelcomeTemplateLanguage(),
    category: "UTILITY" as const,
    components: buildCustomerWelcomeTemplateComponents(settings),
    previewBody: customerWelcomeTemplatePreviewBody(settings),
  };
}

/** Meta template: Men's ethnic wear sale collection announcement (SALE PROJECT). */

export const SALE_PROJECT_TEMPLATE_NAME_DEFAULT = "sale_project";

export const SALE_PROJECT_MAPS_URL =
  "https://maps.app.goo.gl/5LajH7MJcqKfkiQj9";

export const SALE_PROJECT_INSTAGRAM_URL =
  "https://www.instagram.com/fancycollection_renuagarwal";

export const SALE_PROJECT_PHONES = "8126095836 | 8077843874";

export const SALE_PROJECT_HEADER = "Men's Sale Collection";

export const SALE_PROJECT_TEMPLATE_BODY =
  `Dear Customer,\n\n` +
  `Aapke pyaar aur bharose ke liye dil se dhanyavaad!\n\n` +
  `1995 se Fancy Collection by Renu Agarwal ki Rental Collection ko aapne jo pyaar aur bharosa diya hai, wahi hamari sabse badi pehchaan hai.\n\n` +
  `Ab usi bharose, quality aur dedication ke saath hum aapke liye lekar aaye hain:\n\n` +
  `COMPLETE MEN'S ETHNIC WEAR FOR PURCHASE\n\n` +
  `Sherwani | Jodhpuri | Coat Pant & Suits | Handwork Tuxedo | Indo-Western | Kurta Pajama | Kurta Koti | Marriage Accessories & More\n\n` +
  `Jis tarah aapne hamari Rental Variety ko pasand kiya, usi tarah Men's Sale Collection mein bhi aapko exclusive variety, latest designs aur premium quality milegi.\n\n` +
  `New Collection dekhne ke liye showroom zaroor visit karein.\n\n` +
  `Near Balaji Mandir, Court Road, Moradabad\n\n` +
  `Wahi Bharosa. Wahi Quality. Ab Sale Collection Ke Saath Bhi.`;

export const SALE_PROJECT_TEMPLATE_BODY_EXAMPLE: string[] = [];

export function saleProjectTemplateName(): string {
  return (
    process.env.WA_TEMPLATE_MARKETING_SALE_PROJECT?.trim().toLowerCase() ||
    SALE_PROJECT_TEMPLATE_NAME_DEFAULT
  );
}

export function buildSaleProjectTemplateComponents() {
  return [
    {
      type: "HEADER",
      format: "TEXT",
      text: SALE_PROJECT_HEADER,
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

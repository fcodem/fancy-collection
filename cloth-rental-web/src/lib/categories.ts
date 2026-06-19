export const BASE_MENS = ["Sherwani", "Indowestern", "Jodhpuri", "Coat Suit", "Suit", "Blazer", "Kurta"];
export const BASE_WOMENS = ["Saree", "Lehenga", "Gown"];
export const BASE_JEWELLERY = ["Jewellery", "Necklace", "Bangles", "Earrings", "Maang Tikka", "Haath Phool", "Anklet", "Nose Ring", "Matha Patti"];
export const BASE_ACCESSORY = ["Accessory", "Dupatta", "Belt", "Clutch", "Crown/Tiara"];
export const SIZES = [...Array.from({ length: 14 }, (_, i) => String(32 + i * 2)), "Free Size", "Custom"];
export const SUB_CATEGORIES = ["Premium", "Normal", "Cheap"];
export const PAYMENT_METHODS = ["cash", "card", "upi", "bank"];

export type CategoryGroups = {
  mens: string[];
  womens: string[];
  jewellery: string[];
  accessory: string[];
  other: string[];
  all: string[];
};

export async function getAllCategories() {
  let custom: { name: string; group: string }[] = [];
  try {
    const { prisma } = await import("./db");
    custom = await prisma.customCategory.findMany({ where: { active: true } });
  } catch {
    custom = [];
  }
  const merge = (base: string[], group: string) => {
    const extras = custom.filter((c) => c.group === group).map((c) => c.name);
    return [...base, ...extras.filter((n) => !base.includes(n))];
  };
  const mens = merge(BASE_MENS, "mens");
  const womens = merge(BASE_WOMENS, "womens");
  const jewellery = merge(BASE_JEWELLERY, "jewellery");
  const accessory = merge(BASE_ACCESSORY, "accessory");
  const other = custom.filter((c) => c.group === "other").map((c) => c.name);
  return {
    mens,
    womens,
    jewellery,
    accessory,
    other,
    all: [...mens, ...womens, ...jewellery, ...accessory, ...other],
  };
}

export function buildWhatsAppUrl(phone: string, message: string): string {
  let clean = (phone || "").replace(/\D/g, "");
  if (clean.length === 10) clean = "91" + clean;
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
}

export function buildProspectReminderMessage(opts: {
  customerName: string;
  deliveryDate: string;
  deliveryTime?: string;
  returnDate: string;
  returnTime?: string;
  venue?: string;
  dressNames: string[];
  allAvailable: boolean;
  unavailableNames: string[];
}): string {
  const dresses = opts.dressNames.join(", ");
  let msg =
    `Namaste ${opts.customerName}!\n\n` +
    `Aapne *Fancy Collection* par in dresses ke liye interest dikhaya tha:\n` +
    `👗 *${dresses}*\n\n` +
    `📅 Delivery: *${opts.deliveryDate}*` +
    (opts.deliveryTime ? ` (${opts.deliveryTime})` : "") +
    `\n📅 Return: *${opts.returnDate}*` +
    (opts.returnTime ? ` (${opts.returnTime})` : "") +
    (opts.venue ? `\n📍 Venue: *${opts.venue}*` : "") +
    `\n\n`;

  if (opts.allAvailable) {
    msg +=
      `✅ *Good news!* Aapki selected dresses abhi bhi available hain in dates par.\n` +
      `Jaldi se apni booking confirm kar lijiye — pehle aaya, pehle paaya! 🎉\n\n`;
  } else {
    msg +=
      `⚠️ Kuch dresses ab in dates par available nahi hain:\n` +
      `*${opts.unavailableNames.join(", ")}*\n\n` +
      `Baaki dresses abhi bhi available ho sakti hain. Kripya humse contact karein — hum aapke liye best option dhundhenge.\n\n`;
  }

  msg += `✨ *Fancy Collection* – Premium Rental Service`;
  return msg;
}

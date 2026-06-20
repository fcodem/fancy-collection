export function buildWhatsAppUrl(phone: string, message: string): string {
  let clean = (phone || "").replace(/\D/g, "");
  if (clean.length === 10) clean = "91" + clean;
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
}

export function buildBookingConfirmationMessage(opts: {
  customerName: string;
  serialNo: number;
  deliveryDate: string;
  deliveryTime?: string;
  returnDate: string;
  returnTime?: string;
  venue?: string;
  totalRent: number;
  advancePaid: number;
  remaining: number;
  dressNames: string[];
  qrUrl?: string;
  billUrl?: string;
}): string {
  const serial = String(opts.serialNo).padStart(2, "0");
  const dresses = opts.dressNames.map((d, i) => `${i + 1}. ${d}`).join("\n");

  let msg =
    `🙏 *Thank you for choosing Fancy Collection!*\n\n` +
    `Dear *${opts.customerName}*, your booking is confirmed.\n\n`;

  if (opts.qrUrl) {
    msg += `📱 *Booking QR Code:*\n${opts.qrUrl}\n\n`;
  }

  msg +=
    `📋 *Booking Details*\n` +
    `Serial #: *${serial}*\n` +
    `📅 Delivery: *${opts.deliveryDate}*` +
    (opts.deliveryTime ? ` (${opts.deliveryTime})` : "") +
    `\n📅 Return: *${opts.returnDate}*` +
    (opts.returnTime ? ` (${opts.returnTime})` : "") +
    (opts.venue ? `\n📍 Venue: *${opts.venue}*` : "") +
    `\n\n👗 *Your Dresses:*\n${dresses}\n\n` +
    `💰 Total Rent: ₹${opts.totalRent.toLocaleString("en-IN")}\n` +
    `✅ Advance Paid: ₹${opts.advancePaid.toLocaleString("en-IN")}\n` +
    `📌 Balance: ₹${opts.remaining.toLocaleString("en-IN")}\n`;

  if (opts.billUrl) {
    msg += `\n🧾 View Bill: ${opts.billUrl}\n`;
  }

  msg += `\n✨ *FANCY COLLECTION BY RENU AGARWAL*\nRENT | WEAR | RETURN\n📞 8630834711, 8077843874`;
  return msg;
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

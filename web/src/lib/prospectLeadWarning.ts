/** Client-safe prospect warning shape (no server imports). */

export type ProspectDressWarning = {
  prospect_lead_id: number;
  prospect_lead_item_id: number;
  customer_name: string;
  customer_address: string;
  contact_1: string;
  whatsapp_no: string;
  venue: string;
  notes: string;
  staff_names: string;
  delivery_date: string;
  delivery_time: string;
  return_date: string;
  return_time: string;
  created_at: string;
  rent: number;
  dress_name: string;
  other_dresses: string[];
};

/** Confirm text when booking a dress that is on prospect lead(s). */
export function formatProspectConfirmMessage(
  dressLabel: string,
  warnings: ProspectDressWarning[],
): string {
  const blocks = warnings.map((w, i) => {
    const lines = [
      warnings.length > 1 ? `Prospect ${i + 1}:` : "Prospect details:",
      `Customer: ${w.customer_name}`,
      w.customer_address ? `Address: ${w.customer_address}` : "",
      w.contact_1 ? `Contact: ${w.contact_1}` : "",
      w.whatsapp_no ? `WhatsApp: ${w.whatsapp_no}` : "",
      w.venue ? `Venue: ${w.venue}` : "",
      `Delivery: ${w.delivery_date}${w.delivery_time ? ` ${w.delivery_time}` : ""}`,
      `Return: ${w.return_date}${w.return_time ? ` ${w.return_time}` : ""}`,
      w.staff_names ? `Staff: ${w.staff_names}` : "",
      w.notes ? `Notes: ${w.notes}` : "",
      `This dress: ${w.dress_name}${w.rent ? ` (quoted ₹${w.rent})` : ""}`,
      w.other_dresses.length
        ? `Other dresses on this prospect: ${w.other_dresses.join(", ")}`
        : "",
      w.created_at ? `Prospect added: ${w.created_at}` : "",
    ];
    return lines.filter(Boolean).join("\n");
  });

  return [
    `"${dressLabel}" is already on a prospect lead.`,
    "",
    ...blocks,
    "",
    "If you continue, this booking will take the dress.",
    "After you save the booking, the prospect record for this dress will be removed.",
    "",
    "Continue and add this dress to the booking?",
  ].join("\n");
}

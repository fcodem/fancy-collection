/** Return-day-before reminders are disabled — only allowed auto WhatsApp sends are documented in slip automation. */
export async function sendDailyReturnReminders() {
  return {
    date: new Date().toISOString().slice(0, 10),
    channel: "meta_whatsapp",
    total: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    disabled: true,
    results: [],
  };
}

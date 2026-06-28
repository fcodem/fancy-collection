let cronStarted = false;

export function startDevCron() {
  if (process.env.NODE_ENV !== "development" || cronStarted) return;
  cronStarted = true;

  const BASE = process.env.BASE_URL || "http://localhost:3000";
  const secret = process.env.CRON_SECRET || "";

  console.log("[devCron] WhatsApp job cron started (every 15 min)");

  setInterval(async () => {
    try {
      const res = await fetch(`${BASE}/api/cron/whatsapp-jobs`, {
        headers: secret ? { authorization: `Bearer ${secret}` } : {},
      });
      const data = await res.json();
      console.log("[devCron] whatsapp-jobs result:", data);
    } catch (e) {
      console.error("[devCron] whatsapp-jobs error:", e);
    }
  }, 15 * 60 * 1000);
}

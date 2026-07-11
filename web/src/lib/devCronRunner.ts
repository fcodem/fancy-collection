let cronStarted = false;

export function startDevCron() {
  if (process.env.NODE_ENV !== "development" || cronStarted) return;
  cronStarted = true;

  const BASE = process.env.BASE_URL || "http://localhost:3000";
  const secret = process.env.CRON_SECRET || "";

  console.log("[devCron] WhatsApp job cron started (every 15 min)");
  console.log("[devCron] Dress-checker repair cron started (every 6 hours)");
  console.log("[devCron] AI job drain cron started (every 1 min)");
  console.log("[devCron] AI queue watchdog started (every 5 min)");

  const headers = secret ? { authorization: `Bearer ${secret}` } : {};

  setInterval(async () => {
    try {
      const res = await fetch(`${BASE}/api/cron/whatsapp-jobs`, { headers });
      const data = await res.json();
      console.log("[devCron] whatsapp-jobs result:", data);
    } catch (e) {
      console.error("[devCron] whatsapp-jobs error:", e);
    }
  }, 15 * 60 * 1000);

  setInterval(async () => {
    try {
      const res = await fetch(`${BASE}/api/cron/dress-checker-repair`, { headers });
      const data = await res.json();
      console.log("[devCron] dress-checker-repair result:", data);
    } catch (e) {
      console.error("[devCron] dress-checker-repair error:", e);
    }
  }, 6 * 60 * 60 * 1000);

  setInterval(async () => {
    try {
      const res = await fetch(`${BASE}/api/cron/ai-job-worker`, { headers });
      const data = await res.json();
      if (data.processed) console.log("[devCron] ai-job-worker:", data);
    } catch (e) {
      console.error("[devCron] ai-job-worker error:", e);
    }
  }, 60 * 1000);

  setInterval(async () => {
    try {
      const res = await fetch(`${BASE}/api/cron/ai-queue-watchdog`, { headers });
      const data = await res.json();
      console.log("[devCron] ai-queue-watchdog:", data);
    } catch (e) {
      console.error("[devCron] ai-queue-watchdog error:", e);
    }
  }, 5 * 60 * 1000);
}

import { redirect } from "next/navigation";
import { after } from "next/server";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import DashboardView from "@/components/DashboardView";
import { getDashboardData, serializeDashboardData } from "@/lib/services/core";
import { getPendingStaffLoginRequests, getActiveStaffSessions, isOwner } from "@/lib/auth";
import { isWhatsAppConfigured } from "@/lib/services/whatsapp/metaApi";

export const dynamic = "force-dynamic";
/** Keep dashboard under Vercel hobby/pro function limits; fail rather than hang. */
export const maxDuration = 30;

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const owner = isOwner(user);

  // Hobby plan only runs WhatsApp cron once/day — drain a few jobs after dashboard paints.
  if (owner && isWhatsAppConfigured()) {
    after(async () => {
      try {
        const { processWhatsAppJobQueue } = await import("@/lib/services/whatsapp/jobQueue");
        await processWhatsAppJobQueue(2);
      } catch (e) {
        console.error("[dashboard] whatsapp queue drain:", e);
      }
    });
  }

  try {
    // Load dashboard + owner widgets together when pool allows — one round-trip wait.
    const [data, pendingStaff, activeStaff] = await Promise.all([
      getDashboardData().then(serializeDashboardData),
      owner ? getPendingStaffLoginRequests() : Promise.resolve([]),
      owner ? getActiveStaffSessions() : Promise.resolve([]),
    ]);

    return (
      <DashboardView
        data={data}
        isOwner={owner}
        pendingStaff={pendingStaff.map((p) => ({
          id: p.id,
          username: p.user.username,
          staffName: p.user.staff?.name || p.user.username,
          requestedAt: p.requestedAt.toISOString(),
        }))}
        activeStaff={activeStaff.map((s) => ({
          id: s.id,
          username: s.user.username,
          staffName: s.user.staff?.name || s.user.username,
          loginAt: s.loginAt.toISOString(),
        }))}
      />
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[dashboard]", message);
    const isDb =
      /Timed out fetching a new connection|Can't reach database|P1001|P1017|connection/i.test(
        message,
      );
    return (
      <div className="card" style={{ margin: 24, padding: 24, maxWidth: 640 }}>
        <h2 style={{ marginTop: 0 }}>Dashboard could not load</h2>
        <p style={{ color: "var(--text-muted)" }}>
          {isDb
            ? "Database connection timed out. In Vercel → Environment Variables, set DATABASE_URL to the Supabase Transaction pooler (port 6543) with pgbouncer=true&connection_limit=1, then Redeploy."
            : "An error occurred while loading dashboard data. Try again in a moment."}
        </p>
        <pre
          style={{
            whiteSpace: "pre-wrap",
            fontSize: 12,
            background: "#f6f6f6",
            padding: 12,
            borderRadius: 8,
            overflow: "auto",
          }}
        >
          {message.replace(/postgresql:\/\/[^@\s]+@/gi, "postgresql://***@").slice(0, 400)}
        </pre>
        <Link className="btn btn-primary" href="/" style={{ display: "inline-block", marginTop: 12 }}>
          Try again
        </Link>
      </div>
    );
  }
}

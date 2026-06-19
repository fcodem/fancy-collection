import AppLayout from "@/components/AppLayout";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dressDisplayName } from "@/lib/dress";
import Link from "next/link";

function dayStart(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const today = dayStart();

  const [
    todayTotalOrders,
    todayDelivered,
    todayRemaining,
    todayReturning,
    allUndelivered,
    lateReturnCount,
    todayDeliveries,
    todayReturns,
    overdueDeliveryCount,
  ] = await Promise.all([
    prisma.booking.count({ where: { deliveryDate: today } }),
    prisma.booking.count({ where: { deliveryDate: today, status: "delivered" } }),
    prisma.booking.count({ where: { deliveryDate: today, status: "booked" } }),
    prisma.booking.count({
      where: { returnDate: today, status: { in: ["booked", "delivered"] } },
    }),
    prisma.booking.count({ where: { deliveryDate: { lte: today }, status: "booked" } }),
    prisma.booking.count({ where: { returnDate: { lt: today }, status: "delivered" } }),
    prisma.booking.findMany({
      where: { deliveryDate: today },
      include: { bookingItems: true },
      orderBy: { deliveryTime: "asc" },
    }),
    prisma.booking.findMany({
      where: { returnDate: today, status: { in: ["booked", "delivered"] } },
      include: { bookingItems: true },
      orderBy: { returnTime: "asc" },
    }),
    prisma.booking.count({ where: { deliveryDate: { lt: today }, status: "booked" } }),
  ]);

  const dressLine = (b: (typeof todayDeliveries)[0]) =>
    b.bookingItems.length
      ? b.bookingItems
          .map((bi) => dressDisplayName(bi.dressName, bi.category, bi.size))
          .join(", ")
      : b.dressName || "";

  return (
    <AppLayout title="Dashboard" breadcrumb="Overview & today's schedule">
      <div className="page-banner" style={{ marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 52,
              height: 52,
              background: "rgba(255,255,255,0.15)",
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
            }}
          >
            <i className="fa-solid fa-calendar-day" />
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>
              {today.toLocaleDateString("en-IN", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Today&apos;s Schedule</div>
          </div>
        </div>
        <div className="page-banner-actions no-print">
          <Link href="/booking/new" className="btn btn-gold">
            <i className="fa-solid fa-plus" /> New Booking
          </Link>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card primary">
          <div className="stat-value">{todayTotalOrders}</div>
          <div className="stat-label">Today&apos;s Total Orders</div>
        </div>
        <div className="stat-card success">
          <div className="stat-value">{todayDelivered}</div>
          <div className="stat-label">Delivered Today</div>
        </div>
        <div className="stat-card warning">
          <div className="stat-value">{allUndelivered}</div>
          <div className="stat-label">Remaining to Deliver</div>
        </div>
        <div className="stat-card info">
          <div className="stat-value">{todayReturning}</div>
          <div className="stat-label">Returning Today</div>
        </div>
        <Link href="/late-return" className="stat-card" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="stat-value">{lateReturnCount}</div>
          <div className="stat-label">Late Returns</div>
        </Link>
      </div>

      <div className="two-col mb-24">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <i className="fa-solid fa-truck-fast" style={{ marginRight: 8 }} />
              Deliveries Today
            </h3>
            <span className="badge badge-available">{todayTotalOrders}</span>
          </div>
          <div className="card-body p-0">
            {todayDeliveries.length ? (
              todayDeliveries.map((b) => (
                <div
                  key={b.id}
                  style={{
                    display: "flex",
                    gap: 12,
                    padding: "12px 20px",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{b.customerName}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {dressLine(b)} · {b.deliveryTime}
                    </div>
                  </div>
                  <Link href={`/booking/${b.id}`} className="btn btn-outline btn-sm">
                    View
                  </Link>
                </div>
              ))
            ) : (
              <div className="empty-state" style={{ padding: 36 }}>
                <p>No deliveries scheduled today</p>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <i className="fa-solid fa-rotate-left" style={{ marginRight: 8 }} />
              Returns Due Today
            </h3>
            <span className="badge badge-gold">{todayReturning}</span>
          </div>
          <div className="card-body p-0">
            {todayReturns.length ? (
              todayReturns.map((b) => (
                <div
                  key={b.id}
                  style={{
                    display: "flex",
                    gap: 12,
                    padding: "12px 20px",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{b.customerName}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {dressLine(b)} · Return by {b.returnTime}
                    </div>
                  </div>
                  <Link href={`/booking/${b.id}`} className="btn btn-outline btn-sm">
                    View
                  </Link>
                </div>
              ))
            ) : (
              <div className="empty-state" style={{ padding: 36 }}>
                <p>No returns due today</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {user?.role === "owner" && overdueDeliveryCount > 0 ? (
        <div className="alert alert-warning">
          <i className="fa-solid fa-clock" /> {overdueDeliveryCount} overdue delivery
          {overdueDeliveryCount > 1 ? "ies" : ""} —{" "}
          <Link href="/remaining-to-deliver">View remaining to deliver</Link>
        </div>
      ) : null}

      <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
        Logged in as <strong>{user?.username}</strong> ({user?.role}). Next.js + PostgreSQL build — deploy
        ready for Vercel.
      </p>
    </AppLayout>
  );
}

import Link from "next/link";
import DashboardView from "@/components/DashboardView";
import DashboardStaffWidgetsClient from "@/components/DashboardStaffWidgetsClient";
import {
  getDashboardAiHealth,
  getDashboardBusinessSummary,
  getDashboardEssentialData,
  getDashboardFinanceSummary,
  getDashboardOrdersDueSoon,
  getDashboardOverdueRentals,
  getDashboardReturningToday,
} from "@/lib/services/dashboardSections";
import { getActiveStaffSessions, getPendingStaffLoginRequests } from "@/lib/auth";
import { formatDate } from "@/lib/constants";
import { formatInr } from "@/lib/format";

export function DashboardSectionSkeleton({ title }: { title: string }) {
  return (
    <div className="card mb-24" aria-busy="true">
      <div className="card-header"><h3 className="card-title">{title}</h3></div>
      <div className="card-body">
        <div className="skeleton-line" style={{ width: "45%", height: 18, marginBottom: 12 }} />
        <div className="skeleton-line" style={{ width: "75%", height: 14 }} />
      </div>
    </div>
  );
}

export function DashboardShellSkeleton() {
  return (
    <div aria-busy="true">
      <div className="page-banner" style={{ minHeight: 96 }}>
        <div><h1 style={{ margin: 0 }}>Dashboard</h1><div>Loading today&apos;s essential cards…</div></div>
      </div>
      <div className="stats-grid" style={{ marginBottom: 24 }}>
        {Array.from({ length: 6 }, (_, index) => (
          <div className="stat-card" key={index}>
            <div className="skeleton-line" style={{ width: "40%", height: 28, marginBottom: 8 }} />
            <div className="skeleton-line" style={{ width: "70%", height: 12 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export async function DashboardEssentialSection({ isOwner }: { isOwner: boolean }) {
  const data = await getDashboardEssentialData();
  return (
    <DashboardView
      data={data}
      isOwner={isOwner}
      pendingStaff={[]}
      activeStaff={[]}
      showBusinessSummary={false}
      showOrdersDueCard={false}
    />
  );
}

export async function DashboardBusinessSection() {
  const data = await getDashboardBusinessSummary();
  return (
    <div className="card mb-24">
      <div className="card-header"><h3 className="card-title">Business &amp; Inventory Summary</h3></div>
      <div className="card-body" style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
        <Link href="/inventory" className="btn btn-gold">Manage Inventory · {data.totalItems}</Link>
        <span><strong>{data.availableItems}</strong> available</span>
        <span><strong>{data.rentedItems}</strong> rented</span>
        <span><strong>{data.totalCustomers}</strong> customers</span>
        <span><strong>{data.activeRentals}</strong> active rentals</span>
      </div>
    </div>
  );
}

export async function DashboardFinanceSection() {
  const data = await getDashboardFinanceSummary();
  return (
    <div className="card mb-24">
      <div className="card-header"><h3 className="card-title">Finance Summary</h3></div>
      <div className="card-body" style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
        <div><div style={{ color: "var(--text-muted)", fontSize: 12 }}>Monthly revenue</div><strong>₹{formatInr(data.monthlyRevenue)}</strong></div>
        <div><div style={{ color: "var(--text-muted)", fontSize: 12 }}>Outstanding invoices</div><strong>₹{formatInr(data.outstanding)}</strong></div>
        <Link href="/finance" className="btn btn-outline btn-sm">Open Finance</Link>
      </div>
    </div>
  );
}

export async function DashboardOrdersSection() {
  const orders = await getDashboardOrdersDueSoon();
  if (!orders.length) return null;
  return (
    <div className="card mb-24">
      <div className="card-header"><h3 className="card-title">Custom Orders Due Soon</h3><Link href="/orders" className="btn btn-gold btn-sm">View All</Link></div>
      <div className="card-body p-0">
        {orders.map((order) => (
          <div key={order.id} style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div><Link href={`/booking/${order.booking.id}`}><strong>#{String(order.booking.monthlySerial).padStart(2, "0")} — {order.booking.customerName}</strong></Link><div style={{ fontSize: 12 }}>{order.description}</div></div>
            <div>{formatDate(order.deliveryDate)} · {order.deliveryTime}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export async function DashboardOverdueSection() {
  const rows = await getDashboardOverdueRentals();
  if (!rows.length) return null;
  return (
    <div className="card mb-24">
      <div className="card-header"><h3 className="card-title">Overdue Rentals</h3><Link href="/late-return" className="btn btn-danger btn-sm">View All</Link></div>
      <div className="card-body p-0">
        {rows.map((row) => (
          <div key={row.id} style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span><strong>{row.rentalNumber}</strong> · {row.customer.name}</span>
            <span>{formatDate(row.endDate)} · ₹{formatInr(row.totalAmount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export async function DashboardReturningSection() {
  const rows = await getDashboardReturningToday();
  if (!rows.length) return null;
  return (
    <div className="card mb-24">
      <div className="card-header"><h3 className="card-title">Returning Today</h3><Link href="/returning-today" className="btn btn-outline btn-sm">View All</Link></div>
      <div className="card-body p-0">
        {rows.map((row) => (
          <div key={row.id} style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)" }}>
            <Link href={`/booking/${row.id}`}><strong>#{String(row.monthlySerial).padStart(2, "0")} — {row.customerName}</strong></Link>
            <span style={{ marginLeft: 12 }}>{row.returnTime}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export async function DashboardStaffSection() {
  const [pending, active] = await Promise.all([
    getPendingStaffLoginRequests(),
    getActiveStaffSessions(),
  ]);
  return (
    <DashboardStaffWidgetsClient
      pending={pending.map((row) => ({ id: row.id, username: row.user.username, staffName: row.user.staff?.name || row.user.username }))}
      active={active.map((row) => ({ id: row.id, username: row.user.username, staffName: row.user.staff?.name || row.user.username }))}
    />
  );
}

export async function DashboardAiHealthSection() {
  const data = await getDashboardAiHealth();
  return (
    <div className="card mb-24">
      <div className="card-header"><h3 className="card-title">AI Indexing Health</h3></div>
      <div className="card-body" style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <span><strong>{data.queued}</strong> queued/processing</span>
        <span><strong>{data.failed}</strong> failed</span>
        <Link href="/admin/image-sync" className="btn btn-outline btn-sm">Open AI Jobs</Link>
      </div>
    </div>
  );
}

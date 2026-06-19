import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";
import ServerAppShell from "@/components/ServerAppShell";
import { getDashboardData } from "@/lib/services/core";

export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isOwner(user)) redirect("/");
  const data = await getDashboardData();
  return (
    <ServerAppShell>
      <div className="stats-grid">
        <div className="stat-card primary"><div className="stat-value">{data.stats.total_items}</div><div className="stat-label">Total Items</div></div>
        <div className="stat-card success"><div className="stat-value">{data.stats.available_items}</div><div className="stat-label">Available</div></div>
        <div className="stat-card warning"><div className="stat-value">{data.stats.rented_items}</div><div className="stat-label">Rented</div></div>
        <div className="stat-card info"><div className="stat-value">{data.stats.total_customers}</div><div className="stat-label">Customers</div></div>
      </div>
      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-header"><h3 className="card-title">Export Data</h3></div>
        <div className="card-body" style={{ display: "flex", gap: 12 }}>
          <a href="/api/admin/export/bookings" className="btn btn-primary">Export Bookings CSV</a>
          <a href="/api/admin/export/inventory" className="btn btn-outline">Export Inventory CSV</a>
        </div>
      </div>
    </ServerAppShell>
  );
}

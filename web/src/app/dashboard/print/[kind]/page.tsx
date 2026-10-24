import { notFound, redirect } from "next/navigation";
import { getCurrentUserForLayout } from "@/lib/auth";
import { todayIso, formatDate } from "@/lib/constants";
import {
  DASHBOARD_PRINT_MAX,
  loadDashboardPrintList,
  parseDashboardPrintKind,
} from "@/lib/services/dashboardPrintLists";
import PrintListActions from "./PrintListActions";
import { PRINT_CSS, RecordCard, rs } from "./PrintRecordCard";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export default async function DashboardPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string }>;
  searchParams: Promise<{ scope?: string; autoprint?: string }>;
}) {
  const user = await getCurrentUserForLayout();
  if (!user) redirect("/login");

  const { kind: raw } = await params;
  const kind = parseDashboardPrintKind(raw);
  if (!kind) notFound();
  const sp = await searchParams;
  const scope = sp.scope === "all" ? "all" : "due";

  const { records, truncated } = await loadDashboardPrintList(kind, scope);
  const isReturn = kind === "returns";
  const totalBalance = records.reduce((s, r) => s + r.balanceLeft, 0);
  const totalSecurity = records.reduce((s, r) => s + (isReturn ? r.securityCollected : r.securityDeposit), 0);
  const overdue = records.filter((r) => r.isOverdue).length;
  const dressCount = records.reduce((s, r) => s + r.dresses.length, 0);
  const title = isReturn ? "Returns left to collect" : "Bookings remaining to deliver";
  const scopeLabel =
    scope === "all"
      ? isReturn ? "All dresses still out with customers" : "All bookings not yet delivered"
      : isReturn ? "Due today and overdue" : "Due today and overdue";

  return (
    <div className="bw-root">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <PrintListActions kind={kind} scope={scope} autoPrint={sp.autoprint === "1"} />

      <div className="bw-title">
        <div>
          <h1>{title}</h1>
          <div className="sub">{scopeLabel}</div>
        </div>
        <div style={{ fontSize: 9, textAlign: "right" }}>
          Printed {formatDate(todayIso(), "display")} {new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })} by {user.username}
        </div>
      </div>

      <div className="bw-summary">
        <div>Bookings<strong>{records.length}</strong></div>
        <div>Dresses<strong>{dressCount}</strong></div>
        <div>{isReturn ? "Late" : "Overdue"}<strong>{overdue}</strong></div>
        <div>{isReturn ? "Balance still to collect" : "Balance to collect"}<strong>{rs(totalBalance)}</strong></div>
        <div>{isReturn ? "Security held (collected)" : "Security to collect"}<strong>{rs(totalSecurity)}</strong></div>
      </div>

      {truncated && (
        <p style={{ fontSize: 10, fontWeight: 700, border: "1.5px solid #000", padding: 3, margin: "0 0 5px" }}>
          Showing the first {DASHBOARD_PRINT_MAX} records only.
        </p>
      )}

      {records.length === 0 ? (
        <p style={{ fontSize: 14, fontWeight: 700, border: "2px solid #000", padding: 12, textAlign: "center" }}>
          {isReturn ? "No returns left to collect." : "No bookings remaining to deliver."}
        </p>
      ) : (
        records.map((r) => <RecordCard key={r.id} r={r} kind={kind} />)
      )}
    </div>
  );
}

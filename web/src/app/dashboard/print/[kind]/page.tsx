import { notFound, redirect } from "next/navigation";
import { getCurrentUserForLayout } from "@/lib/auth";
import { todayIso, formatDate } from "@/lib/constants";
import {
  DASHBOARD_PRINT_MAX,
  loadDashboardPrintList,
  parseDashboardPrintKind,
} from "@/lib/services/dashboardPrintLists";
import PrintPaginator from "@/components/print/PrintPaginator";
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
      : "Due today and overdue";
  const header = (
    <PrintHeader
      title={title}
      scopeLabel={scopeLabel}
      username={user.username}
      isReturn={isReturn}
      bookings={records.length}
      dressCount={dressCount}
      overdue={overdue}
      totalBalance={totalBalance}
      totalSecurity={totalSecurity}
      truncated={truncated}
    />
  );

  return (
    <div className="bw-root">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <PrintListActions kind={kind} scope={scope} autoPrint={sp.autoprint === "1"} />
      <PrintPaginator
        footerLabel={`${title} · ${scopeLabel}`}
        blocks={[
          { key: `head-${kind}-${scope}`, node: header },
          ...(records.length === 0
            ? [{
                key: "empty",
                node: (
                  <p style={{ fontSize: 14, fontWeight: 700, border: "2px solid #000", padding: 12, textAlign: "center" }}>
                    {isReturn ? "No returns left to collect." : "No bookings remaining to deliver."}
                  </p>
                ),
              }]
            : records.map((r) => ({ key: `rec-${r.id}`, node: <RecordCard r={r} kind={kind} /> }))),
        ]}
      />
    </div>
  );
}

function PrintHeader({
  title,
  scopeLabel,
  username,
  isReturn,
  bookings,
  dressCount,
  overdue,
  totalBalance,
  totalSecurity,
  truncated,
}: {
  title: string;
  scopeLabel: string;
  username: string;
  isReturn: boolean;
  bookings: number;
  dressCount: number;
  overdue: number;
  totalBalance: number;
  totalSecurity: number;
  truncated: boolean;
}) {
  return (
    <>
      <div className="bw-title">
        <div>
          <h1>{title}</h1>
          <div className="sub">{scopeLabel}</div>
        </div>
        <div style={{ fontSize: 9, textAlign: "right" }}>
          Printed {formatDate(todayIso(), "display")} {new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })} by {username}
        </div>
      </div>

      <div className="bw-summary">
        <div>Bookings<strong>{bookings}</strong></div>
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
    </>
  );
}

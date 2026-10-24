import { notFound, redirect } from "next/navigation";
import { getCurrentUserForLayout } from "@/lib/auth";
import { formatInr } from "@/lib/format";
import { todayIso, formatDate } from "@/lib/constants";
import {
  DASHBOARD_PRINT_MAX,
  loadDashboardPrintList,
  parseDashboardPrintKind,
  type PrintBookingRecord,
} from "@/lib/services/dashboardPrintLists";
import PrintListActions from "./PrintListActions";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const rs = (n: number) => `₹${formatInr(n)}`;
const mode = (m: string) => (m.trim() ? ` (${m.toUpperCase()})` : "");

const CSS = `
  .bw-root { background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif; padding: 16px; max-width: 1100px; margin: 0 auto; }
  .bw-root * { color: #000 !important; box-shadow: none !important; }
  .bw-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
  .bw-btn { display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border: 1.5px solid #000; border-radius: 6px; background: #fff; font-size: 13px; font-weight: 700; text-decoration: none; cursor: pointer; }
  .bw-btn-primary, .bw-btn-active { background: #000 !important; color: #fff !important; }
  .bw-btn-primary *, .bw-btn-active * { color: #fff !important; }
  .bw-title { border: 3px solid #000; padding: 10px 14px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
  .bw-title h1 { margin: 0; font-size: 20px; text-transform: uppercase; letter-spacing: 0.04em; }
  .bw-title .sub { font-size: 12px; margin-top: 2px; }
  .bw-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0; border: 2px solid #000; margin-bottom: 14px; }
  .bw-summary div { padding: 6px 10px; border-right: 1px solid #000; font-size: 12px; }
  .bw-summary div:last-child { border-right: none; }
  .bw-summary strong { display: block; font-size: 16px; }
  .bw-rec { border: 2px solid #000; margin-bottom: 14px; page-break-inside: avoid; break-inside: avoid; }
  .bw-rec-head { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; padding: 6px 10px; border-bottom: 2px solid #000; background: #e6e6e6 !important; }
  .bw-rec-head .name { font-size: 16px; font-weight: 800; text-transform: uppercase; }
  .bw-tag { display: inline-block; border: 1.5px solid #000; padding: 0 6px; font-size: 10px; font-weight: 800; margin-left: 6px; text-transform: uppercase; vertical-align: middle; }
  .bw-tag-solid { background: #000 !important; color: #fff !important; }
  .bw-grid { display: grid; grid-template-columns: repeat(4, 1fr); border-bottom: 1px solid #000; }
  .bw-grid > div { padding: 4px 8px; border-right: 1px solid #999; border-bottom: 1px solid #ccc; font-size: 12px; min-width: 0; overflow-wrap: anywhere; }
  .bw-lbl { display: block; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; }
  .bw-table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
  .bw-table th, .bw-table td { border: 1px solid #000; padding: 3px 6px; text-align: left; vertical-align: top; }
  .bw-table th { font-size: 10px; text-transform: uppercase; background: #e6e6e6 !important; }
  .bw-table td.num, .bw-table th.num { text-align: right; white-space: nowrap; }
  .bw-boxes { display: grid; grid-template-columns: 1.2fr 1fr 1.2fr; gap: 8px; padding: 8px; }
  .bw-box { border: 3px solid #000; min-width: 0; }
  .bw-box-h { background: #000 !important; color: #fff !important; font-weight: 800; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; padding: 3px 8px; }
  .bw-box-h * { color: #fff !important; }
  .bw-row { display: flex; justify-content: space-between; gap: 8px; padding: 3px 8px; border-bottom: 1px dashed #000; font-size: 12px; }
  .bw-row:last-child { border-bottom: none; }
  .bw-row b { white-space: nowrap; }
  .bw-row.big { font-size: 14px; font-weight: 800; border-top: 2px solid #000; background: #e6e6e6 !important; }
  .bw-note { padding: 6px 8px; font-size: 12.5px; font-weight: 700; white-space: pre-wrap; overflow-wrap: anywhere; }
  .bw-note.empty { font-weight: 400; font-style: italic; }
  .bw-sec { padding: 0 8px 8px; }
  .bw-sec-t { font-size: 10px; font-weight: 800; text-transform: uppercase; margin: 6px 0 3px; }
  @media (max-width: 760px) { .bw-grid { grid-template-columns: repeat(2, 1fr); } .bw-boxes { grid-template-columns: 1fr; } }
  @media print {
    @page { size: A4 portrait; margin: 8mm; }
    html, body { background: #fff !important; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .no-print { display: none !important; }
    .bw-root { padding: 0; max-width: none; }
    .bw-grid { grid-template-columns: repeat(4, 1fr); }
    .bw-boxes { grid-template-columns: 1.2fr 1fr 1.2fr; }
  }
`;

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="bw-lbl">{label}</span>
      {value || "—"}
    </div>
  );
}

function Row({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className={`bw-row${big ? " big" : ""}`}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function RecordCard({ r, kind }: { r: PrintBookingRecord; kind: "deliveries" | "returns" }) {
  const hasFitting = r.totalFitting > 0 || r.dresses.some((d) => d.fitting > 0);
  const itemDeliveryNotes = r.dresses.filter((d) => d.deliveryNote);
  const dressNotes = r.dresses.filter((d) => d.notes);
  const isReturn = kind === "returns";

  return (
    <section className="bw-rec">
      <div className="bw-rec-head">
        <div>
          <span className="name">#{r.serial} · {r.customerName}</span>
          {r.isOverdue && <span className="bw-tag bw-tag-solid">{isReturn ? "Late return" : "Overdue delivery"}</span>}
          {hasFitting && <span className="bw-tag">✂ Fitting / alteration</span>}
        </div>
        <div style={{ fontSize: 13, fontWeight: 800 }}>
          {isReturn
            ? `RETURN DUE: ${r.returnDate} ${r.returnTime}`
            : `DELIVERY: ${r.deliveryDate} ${r.deliveryTime}`}
        </div>
      </div>

      <div className="bw-grid">
        <Field label="Contact" value={[r.contact1, r.contact2].filter(Boolean).join(" / ")} />
        <Field label="WhatsApp" value={r.whatsapp} />
        <Field label="Venue" value={r.venue} />
        <Field label="Staff" value={r.staffNames} />
        <Field label="Address" value={r.address} />
        <Field label="Booked on" value={r.bookedOn} />
        <Field label="Delivery" value={`${r.deliveryDate} ${r.deliveryTime}`.trim()} />
        <Field label="Return" value={`${r.returnDate} ${r.returnTime}`.trim()} />
      </div>

      <div className="bw-sec">
        <div className="bw-sec-t">Dresses ({r.dresses.length})</div>
        <table className="bw-table">
          <thead>
            <tr>
              <th style={{ width: 22 }}>#</th>
              <th>Dress</th>
              <th className="num">Rent</th>
              {hasFitting && <th className="num">Fitting</th>}
              <th className="num">Advance</th>
              <th className="num">Balance</th>
              {isReturn && <th className="num">Bal. paid at delivery</th>}
              {isReturn && <th className="num">Security at delivery</th>}
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {r.dresses.map((d, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td style={{ fontWeight: 700 }}>
                  {d.label}
                  {d.fitting > 0 && <div style={{ fontSize: 10, fontWeight: 800 }}>✂ ALTERATION NEEDED</div>}
                </td>
                <td className="num">{rs(d.price)}</td>
                {hasFitting && <td className="num" style={{ fontWeight: 800 }}>{d.fitting > 0 ? rs(d.fitting) : "—"}</td>}
                <td className="num">{rs(d.advance)}</td>
                <td className="num">{rs(d.remaining)}</td>
                {isReturn && <td className="num">{rs(d.remainingCollected)}</td>}
                {isReturn && <td className="num">{rs(d.securityCollected)}</td>}
                <td>{d.status}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {dressNotes.length > 0 && (
          <>
            <div className="bw-sec-t">Dress notes</div>
            <div style={{ fontSize: 12 }}>
              {dressNotes.map((d, i) => (
                <div key={i}><b>{r.dresses.length > 1 ? `${d.label}: ` : ""}</b>{d.notes}</div>
              ))}
            </div>
          </>
        )}
        {r.commonNotes && (
          <>
            <div className="bw-sec-t">Common note</div>
            <div style={{ fontSize: 12 }}>{r.commonNotes}</div>
          </>
        )}
        {r.orders.length > 0 && (
          <>
            <div className="bw-sec-t">Custom orders</div>
            <table className="bw-table">
              <thead>
                <tr><th>Order</th><th>Due</th><th className="num">Cost</th><th className="num">Advance</th><th className="num">Balance</th></tr>
              </thead>
              <tbody>
                {r.orders.map((o, i) => (
                  <tr key={i}>
                    <td>{o.description}</td>
                    <td>{o.due}</td>
                    <td className="num">{o.cost > 0 ? rs(o.cost) : "Included"}</td>
                    <td className="num">{rs(o.advance)}</td>
                    <td className="num">{rs(o.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      <div className="bw-boxes">
        <div className="bw-box">
          <div className="bw-box-h">₹ Payment</div>
          <Row label="Total rent" value={rs(r.totalRent)} />
          {r.totalFitting > 0 && <Row label="Fitting / alteration" value={rs(r.totalFitting)} />}
          <Row label={`Advance paid${mode(r.advanceMode)}`} value={rs(r.totalAdvance)} />
          <Row label="Balance due at delivery" value={rs(r.totalRemaining)} />
          {isReturn && (
            <Row label={`Balance collected at delivery${mode(r.remainingMode)}`} value={rs(r.remainingCollected)} />
          )}
          <Row
            label={isReturn ? "BALANCE STILL TO COLLECT" : "BALANCE TO COLLECT"}
            value={r.balanceLeft > 0 ? rs(r.balanceLeft) : "PAID"}
            big
          />
        </div>

        <div className="bw-box">
          <div className="bw-box-h">Security</div>
          <Row label="Security deposit" value={rs(r.securityDeposit)} />
          {isReturn ? (
            <Row
              label={`COLLECTED AT DELIVERY${mode(r.securityMode)}`}
              value={rs(r.securityCollected)}
              big
            />
          ) : (
            <Row label="SECURITY TO COLLECT" value={rs(r.securityDeposit)} big />
          )}
          {isReturn && r.deliveredAt && <Row label="Delivered on" value={r.deliveredAt} />}
        </div>

        <div className="bw-box">
          <div className="bw-box-h">Delivery note</div>
          {r.deliveryNotes || itemDeliveryNotes.length ? (
            <div className="bw-note">
              {r.deliveryNotes}
              {itemDeliveryNotes.map((d, i) => (
                <div key={i} style={{ marginTop: r.deliveryNotes || i > 0 ? 4 : 0 }}>
                  {r.dresses.length > 1 ? `${d.label}: ` : ""}{d.deliveryNote}
                </div>
              ))}
            </div>
          ) : (
            <div className="bw-note empty">{isReturn ? "No delivery note" : "Not delivered yet"}</div>
          )}
        </div>
      </div>
    </section>
  );
}

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
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <PrintListActions kind={kind} scope={scope} autoPrint={sp.autoprint === "1"} />

      <div className="bw-title">
        <div>
          <h1>{title}</h1>
          <div className="sub">{scopeLabel}</div>
        </div>
        <div style={{ fontSize: 12, textAlign: "right" }}>
          Printed {formatDate(todayIso(), "display")} {new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })}
          <br />by {user.username}
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
        <p style={{ fontSize: 12, fontWeight: 700, border: "1.5px solid #000", padding: 6 }}>
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

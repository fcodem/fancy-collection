import { formatInr } from "@/lib/format";
import type { PrintBookingRecord } from "@/lib/services/dashboardPrintTypes";

export const rs = (n: number) => `₹${formatInr(n)}`;
const mode = (m: string) => (m.trim() ? ` (${m.toUpperCase()})` : "");

export const PRINT_CSS = `
  .bw-root { background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif; padding: 16px; max-width: 1100px; margin: 0 auto; }
  .bw-root * { color: #000 !important; box-shadow: none !important; }
  .bw-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
  .bw-btn { display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border: 1.5px solid #000; border-radius: 6px; background: #fff; font-size: 13px; font-weight: 700; text-decoration: none; cursor: pointer; }
  .bw-btn-primary, .bw-btn-active { background: #000 !important; color: #fff !important; }
  .bw-btn-primary *, .bw-btn-active * { color: #fff !important; }
  .bw-title { border: 2.5px solid #000; padding: 6px 10px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: flex-end; gap: 10px; flex-wrap: wrap; }
  .bw-title h1 { margin: 0; font-size: 16px; text-transform: uppercase; letter-spacing: 0.04em; }
  .bw-title .sub { font-size: 11px; margin-top: 1px; }
  .bw-summary { display: grid; grid-template-columns: repeat(5, 1fr); border: 2px solid #000; margin-bottom: 8px; }
  .bw-summary div { padding: 4px 8px; border-right: 1px solid #000; font-size: 10.5px; }
  .bw-summary div:last-child { border-right: none; }
  .bw-summary strong { display: block; font-size: 14px; }
  .bw-rec { border: 2px solid #000; margin-bottom: 8px; page-break-inside: avoid; break-inside: avoid; }
  .bw-rec-head { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; padding: 2px 8px; border-bottom: 2px solid #000; background: #e6e6e6 !important; }
  .bw-rec-head .name { font-size: 13px; font-weight: 800; text-transform: uppercase; }
  .bw-rec-head .due { font-size: 12px; font-weight: 800; }
  .bw-tag { display: inline-block; border: 1.5px solid #000; padding: 0 5px; font-size: 9px; font-weight: 800; margin-left: 6px; text-transform: uppercase; vertical-align: middle; }
  .bw-tag-solid { background: #000 !important; color: #fff !important; }
  .bw-grid { display: grid; grid-template-columns: repeat(4, 1fr); border-bottom: 1px solid #000; }
  .bw-grid > div { padding: 1px 7px; border-right: 1px solid #999; border-bottom: 1px solid #ccc; font-size: 10.5px; min-width: 0; overflow-wrap: anywhere; }
  .bw-lbl { display: block; font-size: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; }
  .bw-table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  .bw-table th, .bw-table td { border: 1px solid #000; padding: 1px 5px; text-align: left; vertical-align: top; }
  .bw-table th { font-size: 8.5px; text-transform: uppercase; background: #e6e6e6 !important; white-space: nowrap; }
  .bw-table td.num, .bw-table th.num { text-align: right; white-space: nowrap; }
  .bw-boxes { display: grid; grid-template-columns: 1.2fr 1fr 1.2fr; gap: 6px; padding: 5px 7px 6px; }
  .bw-box { border: 2.5px solid #000; min-width: 0; }
  .bw-box-h { background: #000 !important; color: #fff !important; font-weight: 800; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; padding: 1px 7px; }
  .bw-box-h * { color: #fff !important; }
  .bw-row { display: flex; justify-content: space-between; gap: 8px; padding: 0 7px; border-bottom: 1px dashed #000; font-size: 10.5px; }
  .bw-row:last-child { border-bottom: none; }
  .bw-row span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .bw-row b { white-space: nowrap; }
  .bw-row.wrap span { white-space: normal; }
  .bw-row.big { font-size: 12px; font-weight: 800; border-top: 2px solid #000; background: #e6e6e6 !important; }
  .bw-note { padding: 3px 7px; font-size: 11px; font-weight: 700; white-space: pre-wrap; overflow-wrap: anywhere; }
  .bw-note.empty { font-weight: 400; font-style: italic; }
  .bw-sec { padding: 0 7px 3px; }
  .bw-sec-t { font-size: 8.5px; font-weight: 800; text-transform: uppercase; margin: 3px 0 1px; }
  .bw-sec-v { font-size: 10.5px; overflow-wrap: anywhere; margin-top: 2px; }
  .bw-sec-v .bw-sec-t { display: inline; margin-right: 4px; }
  @media (max-width: 760px) { .bw-grid { grid-template-columns: repeat(2, 1fr); } .bw-boxes { grid-template-columns: 1fr; } .bw-summary { grid-template-columns: repeat(2, 1fr); } }
  @media print {
    @page { size: A4 portrait; margin: 6mm; }
    html, body { background: #fff !important; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .no-print { display: none !important; }
    .bw-root { padding: 0; max-width: none; }
    .bw-grid { grid-template-columns: repeat(4, 1fr); }
    .bw-boxes { grid-template-columns: 1.2fr 1fr 1.2fr; }
    .bw-summary { grid-template-columns: repeat(5, 1fr); }
  }
`;

function Field({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div style={wide ? { gridColumn: "span 2" } : undefined}>
      <span className="bw-lbl">{label}</span>
      {value || "—"}
    </div>
  );
}

function Row({ label, value, big, wrap }: { label: string; value: string; big?: boolean; wrap?: boolean }) {
  return (
    <div className={`bw-row${big ? " big" : ""}${wrap ? " wrap" : ""}`}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

export function RecordCard({ r, kind }: { r: PrintBookingRecord; kind: "deliveries" | "returns" }) {
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
        <div className="due">
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
        <Field label="Address" value={r.address} wide />
        <Field label="Booked on" value={r.bookedOn} />
        {isReturn ? (
          <Field label="Delivered on" value={r.deliveredAt || `${r.deliveryDate} ${r.deliveryTime}`.trim()} />
        ) : (
          <Field label="Return" value={`${r.returnDate} ${r.returnTime}`.trim()} />
        )}
      </div>

      <div className="bw-sec">
        <table className="bw-table" style={{ marginTop: 4 }}>
          <thead>
            <tr>
              <th style={{ width: 18 }}>#</th>
              <th>Dresses ({r.dresses.length})</th>
              <th className="num">Rent</th>
              {hasFitting && <th className="num">Fitting</th>}
              <th className="num">Advance</th>
              <th className="num">Balance</th>
              {isReturn && <th className="num">Bal. paid</th>}
              {isReturn && <th className="num">Security</th>}
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {r.dresses.map((d, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td style={{ fontWeight: 700 }}>
                  {d.label}
                  {d.fitting > 0 && <span className="bw-tag">✂ Alteration needed</span>}
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
          <div className="bw-sec-v">
            <span className="bw-sec-t">Dress notes:</span>
            {dressNotes.map((d, i) => (
              <span key={i}>
                {i > 0 ? " | " : ""}
                <b>{r.dresses.length > 1 ? `${d.label}: ` : ""}</b>{d.notes}
              </span>
            ))}
          </div>
        )}
        {r.commonNotes && (
          <div className="bw-sec-v">
            <span className="bw-sec-t">Common note:</span>
            {r.commonNotes}
          </div>
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
            <Row label={`Collected at delivery${mode(r.remainingMode)}`} value={rs(r.remainingCollected)} />
          )}
          <Row
            label="BALANCE TO COLLECT"
            value={r.balanceLeft > 0 ? rs(r.balanceLeft) : "PAID"}
            big
          />
        </div>

        <div className="bw-box">
          <div className="bw-box-h">Security</div>
          <Row label="Security deposit" value={rs(r.securityDeposit)} />
          {isReturn && r.securityMode.trim() && <Row label="Payment mode" value={r.securityMode.toUpperCase()} />}
          {isReturn ? (
            <Row label="COLLECTED AT DELIVERY" value={rs(r.securityCollected)} big wrap />
          ) : (
            <Row label="SECURITY TO COLLECT" value={rs(r.securityDeposit)} big wrap />
          )}
        </div>

        <div className="bw-box">
          <div className="bw-box-h">Delivery note</div>
          {r.deliveryNotes || itemDeliveryNotes.length ? (
            <div className="bw-note">
              {r.deliveryNotes}
              {itemDeliveryNotes.map((d, i) => (
                <div key={i} style={{ marginTop: r.deliveryNotes || i > 0 ? 3 : 0 }}>
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

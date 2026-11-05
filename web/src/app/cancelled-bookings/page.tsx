import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserForLayout } from "@/lib/auth";
import RealtimePageRefresher from "@/components/RealtimePageRefresher";
import DownloadPdfButton from "@/components/DownloadPdfButton";
import { todayIso } from "@/lib/constants";
import { formatInr } from "@/lib/format";
import {
  getCancellationList,
  type CancellationRecord,
  type CancellationType,
} from "@/lib/services/cancellationList";

export const dynamic = "force-dynamic";

const rs = (n: number) => `₹${formatInr(n || 0)}`;

const labelStyle = { fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, color: "var(--text-muted)" };

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 150 }}>
      <div style={labelStyle}>{label}</div>
      <div style={{ fontWeight: 600, fontSize: 13, overflowWrap: "anywhere" }}>{value || "—"}</div>
    </div>
  );
}

function RecordCard({ r }: { r: CancellationRecord }) {
  return (
    <div className="card" style={{ marginBottom: 16, borderLeft: "4px solid var(--danger)" }}>
      <div
        className="card-header"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}
      >
        <h3 className="card-title" style={{ margin: 0 }}>
          #{String(r.serial).padStart(2, "0")} — {r.customerName}{" "}
          <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>({r.bookingNumber})</span>
        </h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span className="badge badge-cancelled">{r.kind === "full" ? "Booking cancelled" : "Dress cancelled"}</span>
          <Link href={`/booking/${r.bookingId}`} className="btn btn-sm btn-outline">
            See Booking
          </Link>
        </div>
      </div>
      <div className="card-body">
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 24px", marginBottom: 14 }}>
          <Field label="Cancelled on" value={r.cancelledOn} />
          <Field label="Cancelled by" value={r.cancelledBy} />
          <Field label="Booked on" value={r.bookedOn} />
          <Field label="Contact" value={[r.contact1, r.contact2].filter(Boolean).join(", ")} />
          <Field label="WhatsApp" value={r.whatsappNo} />
          <Field label="Address" value={r.address} />
          <Field label="Venue" value={r.venue} />
          <Field label="Staff" value={r.staffNames} />
          <Field label="Delivery" value={`${r.deliveryDate} ${r.deliveryTime}`.trim()} />
          <Field label="Return" value={`${r.returnDate} ${r.returnTime}`.trim()} />
          <Field label="Advance mode" value={r.advancePaymentMode} />
        </div>

        <div className="table-wrapper" style={{ marginBottom: 14 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Dress</th>
                <th>Category</th>
                <th>Size</th>
                <th>Rent</th>
                <th>Fitting</th>
                <th>Advance</th>
                <th>Dress note</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {r.dresses.map((d, i) => (
                <tr key={`${d.id}-${i}`} style={d.cancelled ? undefined : { opacity: 0.6 }}>
                  <td>{i + 1}</td>
                  <td style={{ fontWeight: 600 }}>{d.name}</td>
                  <td>{d.category || "—"}</td>
                  <td>{d.size || "—"}</td>
                  <td>{rs(d.rent)}</td>
                  <td>{d.fitting > 0 ? rs(d.fitting) : "—"}</td>
                  <td>{rs(d.advance)}</td>
                  <td>{d.notes || "—"}</td>
                  <td>
                    {d.cancelled ? (
                      <span style={{ color: "var(--danger)", fontWeight: 700 }}>
                        Cancelled{d.cancelledOn ? ` · ${d.cancelledOn}` : ""}
                        {r.kind === "partial" && (d.refund > 0 ? ` · Refunded ${rs(d.refund)}` : " · Advance kept")}
                      </span>
                    ) : (
                      <span style={{ color: "var(--success)", fontWeight: 600 }}>Still booked</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 24px" }}>
          <Field label={r.kind === "full" ? "Total rent" : "Cancelled rent"} value={rs(r.rent)} />
          <Field label="Fitting charges" value={rs(r.fitting)} />
          <Field label="Advance taken" value={rs(r.advance)} />
          <Field label="Refunded" value={rs(r.refund)} />
          <Field label="Advance kept" value={rs(r.retained)} />
          <Field label="Security deposit" value={rs(r.securityDeposit)} />
        </div>
        {(r.commonNotes || r.notes) && (
          <div style={{ marginTop: 12, fontSize: 13 }}>
            {r.commonNotes && (
              <div>
                <strong>Common note:</strong> {r.commonNotes}
              </div>
            )}
            {r.notes && r.notes !== r.commonNotes && (
              <div>
                <strong>Booking note:</strong> {r.notes}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const PDF_HEADERS = [
  "S.No",
  "Booking",
  "Type",
  "Cancelled on",
  "Cancelled by",
  "Customer",
  "Contact / WhatsApp",
  "Address / Venue",
  "Booked on",
  "Delivery",
  "Return",
  "Dresses",
  "Rent",
  "Advance",
  "Refunded",
  "Advance kept",
  "Notes",
];

function pdfRow(r: CancellationRecord): string[] {
  return [
    String(r.serial).padStart(2, "0"),
    r.bookingNumber,
    r.kind === "full" ? "Booking cancelled" : "Dress cancelled",
    r.cancelledOn || "—",
    r.cancelledBy || "—",
    r.customerName,
    [r.contact1, r.contact2, r.whatsappNo && `WA ${r.whatsappNo}`].filter(Boolean).join(", "),
    [r.address, r.venue].filter(Boolean).join(" / "),
    r.bookedOn,
    `${r.deliveryDate} ${r.deliveryTime}`.trim(),
    `${r.returnDate} ${r.returnTime}`.trim(),
    r.dresses
      .filter((d) => d.cancelled)
      .map((d) => `${d.name} (${rs(d.rent)})`)
      .join("; "),
    rs(r.rent),
    rs(r.advance),
    rs(r.refund),
    rs(r.retained),
    [r.commonNotes, r.notes].filter(Boolean).join(" | "),
  ];
}

export default async function CancelledBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; q?: string; type?: string }>;
}) {
  const user = await getCurrentUserForLayout();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const month = sp.month === undefined ? todayIso().slice(0, 7) : sp.month === "all" ? "" : sp.month;
  const type: CancellationType = sp.type === "full" || sp.type === "partial" ? sp.type : "all";
  const { records, totals } = await getCancellationList({ month, q: sp.q, type });
  const periodLabel = month
    ? new Date(`${month}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" })
    : "All time";

  return (
    <>
      <RealtimePageRefresher />
      <div className="card" style={{ marginBottom: 16 }}>
        <div
          className="card-header"
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}
        >
          <h3 className="card-title">
            <i className="fa-solid fa-ban" style={{ marginRight: 8, color: "var(--danger)" }} />
            Cancelled Bookings — {periodLabel}
          </h3>
          {records.length > 0 && (
            <DownloadPdfButton
              title={`Cancelled Bookings — ${periodLabel}`}
              filename={`cancelled-bookings-${month || "all"}`}
              headers={PDF_HEADERS}
              rows={records.map(pdfRow)}
              excludeLastColumn={false}
              size="sm"
            />
          )}
        </div>
        <div className="card-body">
          <form method="get" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={labelStyle}>Cancelled in month</span>
              <input type="month" name="month" className="form-control" defaultValue={month} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={labelStyle}>Type</span>
              <select name="type" className="form-control" defaultValue={type}>
                <option value="all">All cancellations</option>
                <option value="full">Whole booking cancelled</option>
                <option value="partial">Some dresses cancelled</option>
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 200 }}>
              <span style={labelStyle}>Search</span>
              <input
                type="search"
                name="q"
                className="form-control"
                defaultValue={sp.q || ""}
                placeholder="Name, phone, serial, booking no, dress…"
              />
            </label>
            <button type="submit" className="btn btn-primary">
              Show
            </button>
            <Link href="/cancelled-bookings?month=" className="btn btn-outline">
              All time
            </Link>
          </form>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 28px", marginTop: 16 }}>
            <Field label="Records" value={String(totals.bookings)} />
            <Field label="Whole bookings" value={String(totals.full)} />
            <Field label="Partly cancelled" value={String(totals.partial)} />
            <Field label="Dresses cancelled" value={String(totals.dresses)} />
            <Field label="Rent cancelled" value={rs(totals.rent)} />
            <Field label="Advance taken" value={rs(totals.advance)} />
            <Field label="Refunded" value={rs(totals.refund)} />
            <Field label="Advance kept" value={rs(totals.retained)} />
          </div>
        </div>
      </div>

      {records.length === 0 ? (
        <div className="card">
          <div className="card-body" style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
            No cancelled bookings for {periodLabel.toLowerCase() === "all time" ? "any date" : periodLabel}.
          </div>
        </div>
      ) : (
        records.map((r) => <RecordCard key={`${r.kind}-${r.bookingId}`} r={r} />)
      )}
    </>
  );
}

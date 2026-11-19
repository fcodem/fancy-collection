import { redirect } from "next/navigation";
import { getCurrentUserForLayout } from "@/lib/auth";
import { todayIso, formatDate } from "@/lib/constants";
import {
  loadAlternatePrintList,
  type AlternatePrintRow,
  type AlternatePrintSide,
} from "@/lib/services/alternatePrintList";
import PrintPaginator, { type PrintBlock } from "@/components/print/PrintPaginator";
import { PRINT_CSS, rs } from "../[kind]/PrintRecordCard";
import AlternatePrintActions from "./AlternatePrintActions";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

function Field({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div style={wide ? { gridColumn: "span 2" } : undefined}>
      <span className="bw-lbl">{label}</span>
      {value || "—"}
    </div>
  );
}

function SideBlock({
  title,
  side,
  tone,
}: {
  title: string;
  side: AlternatePrintSide;
  tone: "return" | "next";
}) {
  const solid = tone === "next";
  return (
    <div style={{ border: "2px solid #000", flex: 1, minWidth: 0 }}>
      <div
        style={{
          background: solid ? "#000" : "#e6e6e6",
          color: solid ? "#fff" : "#000",
          padding: "4px 8px",
          fontWeight: 800,
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {title} · #{side.serial}
      </div>
      <div className="bw-grid" style={{ borderBottom: "none", gridTemplateColumns: "1fr 1fr" }}>
        <Field label="Customer" value={side.customerName} wide />
        <Field label="Contact" value={side.contact} />
        <Field label="WhatsApp" value={side.whatsapp} />
        <Field label="Venue" value={side.venue} />
        <Field label="Address" value={side.address} wide />
        <Field label="Delivery" value={`${side.deliveryDate} ${side.deliveryTime}`.trim()} />
        <Field label="Return" value={`${side.returnDate} ${side.returnTime}`.trim()} />
        <Field label="Dresses" value={side.dresses.join(", ") || "—"} wide />
        <Field label="Rent" value={rs(side.totalRent)} />
        <Field label="Balance left" value={side.balanceLeft > 0 ? rs(side.balanceLeft) : "PAID"} />
        <Field label="Security" value={rs(side.securityDeposit)} />
        <Field label="Security collected" value={rs(side.securityCollected)} />
        {side.itemNotes ? <Field label="Dress notes" value={side.itemNotes} wide /> : null}
        {side.commonNotes ? <Field label="Common note" value={side.commonNotes} wide /> : null}
      </div>
    </div>
  );
}

function AlternateCard({ row }: { row: AlternatePrintRow }) {
  return (
    <section className="bw-rec">
      <div className="bw-rec-head">
        <div>
          <span className="name">
            ALTERNATE HANDOVER · Return #{row.returning.serial}
            {row.next ? ` → Deliver #${row.next.serial}` : ""}
          </span>
          {row.categories.length > 0 && (
            <span className="bw-tag">{row.categories.join(" · ")}</span>
          )}
        </div>
        <div className="due">
          RETURN: {row.returning.returnDate} {row.returning.returnTime}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, padding: 6 }}>
        <SideBlock title="Returning customer (complete record)" side={row.returning} tone="return" />
        {row.next ? (
          <SideBlock title="Where dress is going next (complete record)" side={row.next} tone="next" />
        ) : (
          <div style={{ border: "2px dashed #000", padding: 12, fontWeight: 700 }}>
            No next delivery found for these dresses on this date.
          </div>
        )}
      </div>
      {row.deliveryNotes ? (
        <div className="bw-sec-v" style={{ padding: "4px 8px 8px" }}>
          <span className="bw-sec-t">Delivery notes:</span> {row.deliveryNotes}
        </div>
      ) : null}
    </section>
  );
}

export default async function AlternatePrintPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; autoprint?: string }>;
}) {
  const user = await getCurrentUserForLayout();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const today = todayIso();
  const date = sp.date && ISO_RE.test(sp.date) ? sp.date : today;
  const { dateLabel, rows, sections } = await loadAlternatePrintList(date);

  const header = (
    <>
      <div className="bw-title">
        <div>
          <h1>Alternate booking list</h1>
          <div className="sub">
            Same-day handover · Return → next delivery · {dateLabel} · Print order: 1. Mens → 2. Women → 3. Jewellery
          </div>
        </div>
        <div style={{ fontSize: 9, textAlign: "right" }}>
          Printed {formatDate(today, "display")}{" "}
          {new Date().toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
            timeZone: "Asia/Kolkata",
          })}{" "}
          by {user.username}
        </div>
      </div>
      <div className="bw-summary" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div>
          Handovers
          <strong>{rows.length}</strong>
        </div>
        <div>
          With next booking
          <strong>{rows.filter((r) => r.next).length}</strong>
        </div>
        <div>
          Date
          <strong>{dateLabel}</strong>
        </div>
        <div>
          Balance on returns
          <strong>{rs(rows.reduce((s, r) => s + r.returning.balanceLeft, 0))}</strong>
        </div>
      </div>
      {sections.length > 0 && (
        <div
          className="bw-summary"
          style={{ gridTemplateColumns: `repeat(${Math.max(sections.length, 1)}, 1fr)` }}
        >
          {sections.map((s) => (
            <div key={s.division}>
              {s.label}
              <strong>{s.rows.length}</strong>
            </div>
          ))}
        </div>
      )}
    </>
  );

  const blocks: PrintBlock[] = [{ key: `head-alt-${date}`, node: header }];

  if (!rows.length) {
    blocks.push({
      key: "empty",
      node: (
        <p style={{ fontSize: 14, fontWeight: 700, border: "2px solid #000", padding: 12, textAlign: "center" }}>
          No alternate handovers for {dateLabel}.
        </p>
      ),
    });
  } else {
    sections.forEach((sec, idx) => {
      blocks.push({
        key: `sec-${sec.division}`,
        keepWithNext: true,
        breakBefore: idx > 0,
        node: (
          <div
            style={{
              background: "#000",
              color: "#fff",
              padding: "6px 10px",
              margin: "2px 0 6px",
              fontSize: 15,
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              display: "flex",
              justifyContent: "space-between",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span style={{ color: "#fff" }}>{sec.label}</span>
            <span style={{ color: "#fff", fontSize: 12 }}>
              Order {idx + 1} of {sections.length} · {sec.rows.length} handover
              {sec.rows.length === 1 ? "" : "s"}
            </span>
          </div>
        ),
      });
      for (const row of sec.rows) {
        blocks.push({ key: `alt-${sec.division}-${row.id}`, node: <AlternateCard row={row} /> });
      }
    });
  }

  return (
    <div className="bw-root">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <AlternatePrintActions date={date} autoPrint={sp.autoprint === "1"} />
      <PrintPaginator footerLabel={`Alternate list · ${dateLabel}`} blocks={blocks} />
    </div>
  );
}

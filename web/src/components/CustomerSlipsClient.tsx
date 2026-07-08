"use client";

import Link from "next/link";

export type CustomerSlipCard = {
  kind: "booking" | "delivery" | "return";
  title: string;
  subtitle: string;
  available: boolean;
  unavailableReason?: string;
  viewHref: string | null;
  pdfUrl: string | null;
  sentAt: string | null;
  filename: string | null;
};

const KIND_STYLE: Record<
  CustomerSlipCard["kind"],
  { color: string; border: string; icon: string }
> = {
  booking: { color: "#1a5c2a", border: "#1a5c2a", icon: "fa-receipt" },
  delivery: { color: "#1565c0", border: "#1565c0", icon: "fa-truck-fast" },
  return: { color: "#b8860b", border: "#c9a84c", icon: "fa-circle-check" },
};

export default function CustomerSlipsClient({
  bookingId,
  serialLabel,
  customerName,
  slips,
}: {
  bookingId: number;
  serialLabel: string;
  customerName: string;
  slips: CustomerSlipCard[];
}) {
  return (
    <div>
      <div
        className="no-print"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <div>
          <Link href={`/booking/${bookingId}`} style={{ fontSize: 13, color: "var(--primary)" }}>
            ← Back to booking
          </Link>
          <h1 style={{ margin: "8px 0 4px", fontSize: 22 }}>
            Customer slips — Serial #{serialLabel}
          </h1>
          <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 14 }}>
            {customerName} · Booking, delivery &amp; return PDFs sent on WhatsApp
          </p>
        </div>
      </div>

      <div style={{ display: "grid", gap: 20 }}>
        {slips.map((slip) => {
          const style = KIND_STYLE[slip.kind];
          return (
            <section
              key={slip.kind}
              className="card"
              style={{ borderLeft: `4px solid ${style.border}` }}
            >
              <div
                className="card-header"
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 12,
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <h2 className="card-title" style={{ margin: 0, color: style.color }}>
                    <i className={`fa-solid ${style.icon}`} style={{ marginRight: 8 }} />
                    {slip.title}
                  </h2>
                  <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
                    {slip.subtitle}
                    {slip.sentAt ? ` · Sent ${slip.sentAt}` : ""}
                    {slip.filename ? ` · ${slip.filename}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {slip.viewHref && (
                    <Link
                      href={slip.viewHref}
                      className="btn btn-outline btn-sm"
                      style={{ color: style.color, borderColor: style.border }}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open slip
                    </Link>
                  )}
                  {slip.pdfUrl && (
                    <a
                      href={slip.pdfUrl}
                      className="btn btn-primary btn-sm"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open PDF
                    </a>
                  )}
                </div>
              </div>

              <div className="card-body" style={{ padding: 0 }}>
                {!slip.available ? (
                  <div style={{ padding: 24, color: "var(--text-muted)", fontSize: 14 }}>
                    {slip.unavailableReason || "This slip is not available yet."}
                  </div>
                ) : slip.pdfUrl ? (
                  <iframe
                    title={`${slip.title} PDF`}
                    src={slip.pdfUrl}
                    style={{
                      width: "100%",
                      height: 720,
                      border: "none",
                      background: "#f3f4f6",
                      display: "block",
                    }}
                  />
                ) : slip.viewHref ? (
                  <iframe
                    title={`${slip.title} preview`}
                    src={slip.viewHref}
                    style={{
                      width: "100%",
                      height: 900,
                      border: "none",
                      background: "#fff",
                      display: "block",
                    }}
                  />
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

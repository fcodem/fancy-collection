import Link from "next/link";

export const SCAN_DRESS_AVAILABILITY_HREF =
  "/inventory/search/scan?mode=scan-availability";

export default function ScanDressAvailabilityCard() {
  return (
    <div
      className="card"
      style={{ marginBottom: 20 }}
      data-testid="scan-dress-availability-card"
    >
      <div
        className="card-body"
        style={{
          display: "flex",
          gap: 16,
          alignItems: "center",
          flexWrap: "wrap",
          padding: "16px 20px",
        }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 12,
            background: "linear-gradient(135deg, var(--primary-dark), var(--primary))",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 22,
            flexShrink: 0,
          }}
          aria-hidden="true"
        >
          <i className="fa-solid fa-qrcode" />
        </div>
        <div style={{ flex: "1 1 220px", minWidth: 0 }}>
          <h3
            className="card-title"
            style={{ margin: 0, fontSize: 17, lineHeight: 1.3 }}
          >
            Scan Dress Availability
          </h3>
          <p
            style={{
              margin: "6px 0 0",
              fontSize: 13,
              color: "var(--text-muted)",
              lineHeight: 1.45,
            }}
          >
            Scan a dress QR/barcode and check whether it is available between
            selected delivery and return dates.
          </p>
        </div>
        <Link
          href={SCAN_DRESS_AVAILABILITY_HREF}
          prefetch={false}
          className="btn btn-primary"
          style={{ minHeight: 44, flexShrink: 0 }}
        >
          <i className="fa-solid fa-barcode" style={{ marginRight: 8 }} />
          Open Scanner
        </Link>
      </div>
    </div>
  );
}

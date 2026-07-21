import {
  SLIP_AMBER,
  SLIP_BORDER,
  SLIP_DARK,
  SLIP_DEFAULT_ADDRESS,
  SLIP_DEFAULT_PHONE,
  SLIP_GOLD,
  SLIP_GREY,
  SLIP_RED,
  slipPadSerial,
  slipRs,
} from "@/lib/slipConstants";
import SlipBrandTitle from "@/components/SlipBrandTitle";
import SlipLogo from "@/components/SlipLogo";
import SlipMottoBanner from "@/components/SlipMottoBanner";
import Emoji from "@/components/Emoji";
import PremiumSlipMarker from "@/components/PremiumSlipMarker";

export type IncompleteReturnSlipProps = {
  booking: {
    publicBookingId: string;
    monthlySerial: number;
    customerName: string;
    customerAddress: string;
    contact1: string;
    whatsappNo?: string | null;
    deliveryDate: string;
    deliveryTime: string;
    returnDate: string;
    returnTime: string;
    reportedDate?: string;
    reportedTime?: string;
    venue?: string | null;
    staffNames?: string | null;
    securityDeposit: number;
    securityCollected: number;
    securityHeld: number;
    securityReturned: number;
    incompleteNotes?: string | null;
    incompletePhoto?: string | null;
    status: string;
  };
  incompleteItems: Array<{
    dressName: string;
    category: string;
    size: string;
    color?: string | null;
    notes?: string | null;
    securityHeld: number;
    photo?: string | null;
    catalogPhotoUrl?: string | null;
  }>;
  returnedItems: Array<{
    dressName: string;
    category: string;
    size: string;
  }>;
  qrDataUrl?: string | null;
  businessName: string;
  businessPhone: string;
  businessAddress?: string;
};

export default function IncompleteReturnSlip(props: IncompleteReturnSlipProps) {
  const { booking: b, incompleteItems, returnedItems, qrDataUrl, businessName, businessPhone, businessAddress } = props;
  const slipNo = slipPadSerial(b.monthlySerial);
  const displayPhone = businessPhone?.trim() || SLIP_DEFAULT_PHONE;
  const displayAddress = businessAddress?.trim() || SLIP_DEFAULT_ADDRESS;
  const securityReturned = b.securityReturned ?? Math.max(0, b.securityCollected - b.securityHeld);

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
          @media print {
            .slip-page-wrap { padding: 0 !important; margin: 0 !important; background: #fff !important; min-height: 0 !important; }
            #incomplete-slip-root {
              width: 210mm;
              min-height: 0 !important;
              height: auto !important;
              margin: 0 !important;
              padding: 0 !important;
              border-radius: 0 !important;
              box-shadow: none !important;
            }
            .slip-screen-only { display: none !important; }
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            .no-break { page-break-inside: avoid; break-inside: avoid; }
          }
          @media screen {
            #incomplete-slip-root.slip-container {
              max-width: 920px;
              margin: 16px auto;
              background: #fff;
              border-radius: 14px;
              box-shadow: 0 8px 28px rgba(0,0,0,0.12);
              overflow: hidden;
            }
          }
          .slip-two-col {
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
          }
          .slip-two-col > * {
            flex: 1 1 280px;
            min-width: 0;
          }
          .slip-responsive-table {
            width: 100%;
            border-collapse: collapse;
          }
          @media (max-width: 760px) {
            .slip-responsive-table thead { display: none; }
            .slip-responsive-table,
            .slip-responsive-table tbody,
            .slip-responsive-table tr,
            .slip-responsive-table td {
              display: block;
              width: 100%;
            }
            .slip-responsive-table tr {
              margin-bottom: 10px;
              border: 1px solid ${SLIP_BORDER};
              border-radius: 10px;
              overflow: hidden;
            }
            .slip-responsive-table td {
              border-bottom: 1px solid ${SLIP_BORDER};
              padding: 8px 12px 8px 46%;
              position: relative;
              text-align: right !important;
              min-height: 34px;
            }
            .slip-responsive-table td:last-child { border-bottom: none; }
            .slip-responsive-table td::before {
              content: attr(data-label);
              position: absolute;
              left: 10px;
              top: 50%;
              transform: translateY(-50%);
              width: 42%;
              text-align: left;
              font-weight: 700;
              color: ${SLIP_GREY};
              font-size: 11px;
            }
          }
        `,
        }}
      />

      <div
        id="incomplete-slip-root"
        className="slip-container"
        style={{
          fontFamily: "system-ui, -apple-system, sans-serif",
          color: SLIP_DARK,
          background: "#fff",
          position: "relative",
        }}
      >
        <PremiumSlipMarker kind="incomplete" />
        <header
          style={{
            background: `linear-gradient(135deg, #c2410c 0%, ${SLIP_AMBER} 100%)`,
            padding: "16px clamp(12px, 2.5vw, 24px)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 14,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              <SlipLogo size={52} style={{ marginTop: 0, borderWidth: 2 }} />
              <div style={{ minWidth: 0 }}>
                <SlipBrandTitle
                  name={businessName}
                  nameStyle={{
                    color: "#fff",
                    fontFamily: "Georgia, serif",
                    fontWeight: 800,
                    fontSize: "clamp(20px, 3vw, 28px)",
                    lineHeight: 1.15,
                  }}
                  badgeStyle={{ fontSize: "clamp(9px, 1.6vw, 11px)" }}
                />
                <div style={{ color: "rgba(255,255,255,0.92)", fontSize: "clamp(10px, 1.8vw, 12px)", marginTop: 3 }}>
                  {displayAddress}
                </div>
                <div style={{ color: SLIP_GOLD, fontWeight: 700, fontSize: "clamp(11px, 1.9vw, 13px)", marginTop: 2 }}>
                  {displayPhone}
                </div>
              </div>
            </div>

            <div style={{ textAlign: "right" }}>
              <div style={{ color: "#fff", fontSize: "clamp(14px, 2.2vw, 18px)", fontWeight: 900, letterSpacing: "0.06em" }}>
                INCOMPLETE RETURN
              </div>
              <div style={{ color: SLIP_GOLD, fontSize: "clamp(18px, 3vw, 24px)", fontWeight: 900 }}>Slip #{slipNo}</div>
              <div style={{ color: "rgba(255,255,255,0.88)", fontFamily: "monospace", fontSize: "clamp(10px, 1.8vw, 12px)" }}>
                {b.publicBookingId}
              </div>
            </div>
          </div>
          <div style={{ height: 2, background: SLIP_GOLD, marginTop: 12 }} />
          <SlipMottoBanner fullWidth />
        </header>

        <section
          style={{
            background: "linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%)",
            borderTop: `2px solid ${SLIP_AMBER}`,
            borderBottom: `2px solid ${SLIP_AMBER}`,
            padding: "12px clamp(12px, 2.5vw, 24px)",
            textAlign: "center",
          }}
        >
          <div style={{ color: "#bf360c", fontSize: "clamp(16px, 3vw, 22px)", fontWeight: 800, fontFamily: "Georgia, serif" }}>
            <Emoji char="⚠" /> Items Not Returned In Full
          </div>
          <div style={{ color: SLIP_GREY, marginTop: 4, fontSize: "clamp(11px, 1.9vw, 13px)" }}>
            This record documents missing, damaged, or incomplete return of rented items.
          </div>
        </section>

        <section
          style={{
            background: "linear-gradient(135deg, #fff8e1 0%, #ffecb3 100%)",
            borderBottom: `3px solid ${SLIP_GOLD}`,
            padding: "14px clamp(12px, 2.5vw, 24px)",
            textAlign: "center",
          }}
        >
          <div style={{ color: "#8a5a00", fontWeight: 800, fontSize: "clamp(12px, 2vw, 14px)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Original Return Deadline Was
          </div>
          <div style={{ color: "#bf360c", fontWeight: 900, fontSize: "clamp(22px, 4vw, 32px)", marginTop: 4, fontFamily: "Georgia, serif" }}>
            {b.returnDate} • {b.returnTime}
          </div>
          {(b.reportedDate || b.reportedTime) && (
            <div style={{ color: SLIP_GREY, marginTop: 6, fontSize: "clamp(11px, 1.9vw, 13px)" }}>
              Reported on {b.reportedDate} • {b.reportedTime}
            </div>
          )}
        </section>

        <section style={{ padding: "14px clamp(12px, 2.5vw, 24px)" }}>
          <div className="slip-two-col">
            <div
              style={{
                border: `1px solid ${SLIP_BORDER}`,
                borderLeft: `4px solid ${SLIP_AMBER}`,
                borderRadius: 10,
                background: "#fff8f0",
                padding: "12px 14px",
              }}
            >
              <div style={{ color: "#c2410c", fontWeight: 800, fontSize: "clamp(11px, 1.9vw, 13px)", textTransform: "uppercase", marginBottom: 8 }}>
                Customer Details
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 10px", fontSize: "clamp(12px, 2vw, 14px)" }}>
                <strong>Name:</strong>
                <span>{b.customerName}</span>
                <strong>Contact:</strong>
                <span>{b.contact1}{b.whatsappNo ? ` / ${b.whatsappNo}` : ""}</span>
                <strong>Address:</strong>
                <span>{b.customerAddress}</span>
                <strong>Venue:</strong>
                <span>{b.venue || "—"}</span>
                {b.staffNames && (
                  <>
                    <strong>Staff:</strong>
                    <span>{b.staffNames}</span>
                  </>
                )}
              </div>
            </div>

            <div
              style={{
                border: `1px solid ${SLIP_BORDER}`,
                borderLeft: `4px solid ${SLIP_GOLD}`,
                borderRadius: 10,
                background: "#fffdf6",
                padding: "12px 14px",
              }}
            >
              <div style={{ color: "#815400", fontWeight: 800, fontSize: "clamp(11px, 1.9vw, 13px)", textTransform: "uppercase", marginBottom: 8 }}>
                Rental Schedule
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 10px", fontSize: "clamp(12px, 2vw, 14px)" }}>
                <strong>Delivery:</strong>
                <span>{b.deliveryDate} • {b.deliveryTime}</span>
                <strong>Return Due:</strong>
                <span style={{ color: "#bf360c", fontWeight: 700 }}>{b.returnDate} • {b.returnTime}</span>
              </div>
            </div>
          </div>
        </section>

        <section data-slip-section="items" style={{ padding: "0 clamp(12px, 2.5vw, 24px) 14px" }}>
          <div style={{ color: "#c2410c", fontWeight: 800, fontSize: "clamp(12px, 2vw, 14px)", textTransform: "uppercase", marginBottom: 8 }}>
            Incomplete / Missing Items ({incompleteItems.length})
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="slip-responsive-table" style={{ border: `1px solid ${SLIP_BORDER}`, borderRadius: 10, overflow: "hidden" }}>
              <thead>
                <tr style={{ background: "#fff3e0", color: "#bf360c" }}>
                  <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 12 }}>#</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 12 }}>Item</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 12 }}>Category / Size</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 12 }}>Issue Notes</th>
                  <th style={{ padding: "10px 12px", textAlign: "right", fontSize: 12 }}>Security Held</th>
                </tr>
              </thead>
              <tbody>
                {incompleteItems.map((item, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${SLIP_BORDER}`, background: i % 2 ? "#fffbfa" : "#fff" }}>
                    <td data-label="#" style={{ padding: "10px 12px", fontWeight: 700 }}>{i + 1}</td>
                    <td data-label="Item" style={{ padding: "10px 12px" }}>
                      <div style={{ fontWeight: 700 }}>{item.dressName}</div>
                      {item.color && <div style={{ fontSize: 12, color: SLIP_GREY }}>Color: {item.color}</div>}
                      {item.catalogPhotoUrl && (
                        <img
                          src={item.catalogPhotoUrl}
                          alt={`${item.dressName} reference`}
                          style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 6, marginTop: 6, border: `1px solid ${SLIP_BORDER}` }}
                        />
                      )}
                    </td>
                    <td data-label="Category" style={{ padding: "10px 12px", fontSize: 13 }}>
                      {item.category || "—"} / {item.size || "—"}
                    </td>
                    <td data-label="Notes" style={{ padding: "10px 12px", fontSize: 13, color: SLIP_RED, fontWeight: 600 }}>
                      {item.notes || "Not returned / incomplete"}
                    </td>
                    <td data-label="Security" style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: "#c2410c" }}>
                      {slipRs(item.securityHeld)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {returnedItems.length > 0 && (
          <section style={{ padding: "0 clamp(12px, 2.5vw, 24px) 14px" }}>
            <div style={{ color: "#2e7d32", fontWeight: 800, fontSize: "clamp(12px, 2vw, 14px)", textTransform: "uppercase", marginBottom: 8 }}>
              Items Returned OK ({returnedItems.length})
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {returnedItems.map((item, i) => (
                <div
                  key={i}
                  style={{
                    border: `1px solid #a5d6a7`,
                    background: "#f1f8e9",
                    borderRadius: 8,
                    padding: "8px 12px",
                    fontSize: 13,
                  }}
                >
                  <strong>{item.dressName}</strong>
                  <span style={{ color: SLIP_GREY }}> — {item.category || "—"} / {item.size || "—"}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section data-slip-section="payment-summary" style={{ padding: "0 clamp(12px, 2.5vw, 24px) 14px" }}>
          <div
            style={{
              border: `2px solid ${SLIP_AMBER}`,
              borderRadius: 10,
              background: "#fff8f0",
              padding: "14px 16px",
            }}
          >
            <div style={{ color: "#c2410c", fontWeight: 800, fontSize: 13, textTransform: "uppercase", marginBottom: 10 }}>
              Security Summary
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "8px 16px", fontSize: 14 }}>
              <span>Total Security Collected</span>
              <strong>{slipRs(b.securityCollected)}</strong>
              <span style={{ color: SLIP_RED }}>Security Held (Incomplete Items)</span>
              <strong style={{ color: SLIP_RED }}>{slipRs(b.securityHeld)}</strong>
              <span>Security Returned to Customer</span>
              <strong style={{ color: "#2e7d32" }}>{slipRs(securityReturned)}</strong>
            </div>
          </div>
        </section>

        {b.incompleteNotes && (
          <section style={{ padding: "0 clamp(12px, 2.5vw, 24px) 14px" }}>
            <div style={{ border: `1px solid ${SLIP_BORDER}`, borderRadius: 10, padding: "12px 14px", background: "#fafafa" }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: SLIP_GREY, textTransform: "uppercase", marginBottom: 8 }}>
                Additional Notes
              </div>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{b.incompleteNotes}</p>
            </div>
          </section>
        )}

        <section
          style={{
            padding: "14px clamp(12px, 2.5vw, 24px)",
            borderTop: `1px solid ${SLIP_BORDER}`,
            background: "#fafafa",
            fontSize: "clamp(10px, 1.8vw, 11px)",
            color: SLIP_GREY,
            lineHeight: 1.55,
          }}
        >
          <strong style={{ color: SLIP_DARK }}>Important:</strong> Customer must settle any outstanding items or charges before security held is released. Missing items remain the customer&apos;s responsibility until resolved. Contact {displayPhone} for resolution.
        </section>

        {qrDataUrl && (
          <section
            style={{
              padding: "24px clamp(12px, 2.5vw, 24px) 32px",
              borderTop: `1px dashed ${SLIP_BORDER}`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 220,
              textAlign: "center",
            }}
          >
            <img src={qrDataUrl} alt="Booking QR" style={{ width: 200, height: 200, display: "block" }} />
            <div style={{ fontSize: 12, color: SLIP_GREY, marginTop: 10, fontWeight: 600 }}>Scan to view booking</div>
          </section>
        )}
      </div>
    </>
  );
}

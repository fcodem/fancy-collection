import type { ReactNode } from "react";

export type DeliverySlipProps = {
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
    venue?: string | null;
    staffNames?: string | null;
    securityDeposit: number;
    totalPrice: number;
    totalAdvance: number;
    totalRemaining: number;
    remainingCollected: number;
    securityCollected: number;
    deliveryNotes?: string | null;
    remainingPaymentMode?: string | null;
    securityPaymentMode?: string | null;
    deliveredAt: string;
    status: string;
    createdAt: string;
  };
  items: Array<{
    dressName: string;
    category: string;
    size: string;
    color?: string | null;
    price: number;
    advance: number;
    remaining: number;
    notes?: string | null;
  }>;
  qrDataUrl?: string | null;
  businessName: string;
  businessPhone: string;
  businessAddress?: string;
  businessTagline?: string;
  /** Shown under the DELIVERED banner for single-dress partial deliveries. */
  slipSubtitle?: string;
};

const G = "#1a5c2a";
const GOLD = "#c9a84c";
const RED = "#c0392b";
const BLUE = "#1565c0";
const LIGHT_GREEN = "#f0faf3";
const GREY = "#555555";
const BORDER = "#e0e0e0";
const SUCCESS = "#27ae60";

const DEFAULT_ADDRESS = "Banwata Ganj Near Balaji Mandir Court Road Moradabad 244001";
const DEFAULT_PHONE = "8077843874, 8630834711";
const GSTIN = "09BJZPA3417L1ZQ";
const GST_RATE = 18;

function rs(n: number) {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function payMode(mode?: string | null) {
  if (!mode?.trim()) return "";
  return ` (${mode.toUpperCase()})`;
}

const TERMS = [
  "Goods once booked CANNOT be cancelled under any circumstances.",
  "Booking advance amount is NOT adjustable in any other bookings.",
  "All items must be returned by the return date and time mentioned above.",
  "Late returns will attract additional rental charges per day.",
  "Any damage, stains, tears or loss to the rented items is chargeable.",
  "Security deposit will be refunded ONLY upon return of all items in original condition.",
  "Items will be handed over to the registered customer with valid photo ID only.",
  "Team Fancy Collection is not responsible for any alterations done outside our premises.",
  "In case of any dispute, the decision of Team Fancy Collection management shall be final.",
  "Customer is responsible for proper storage and care of items during rental period.",
];

export default function DeliverySlip(props: DeliverySlipProps) {
  const { booking: b, items, qrDataUrl, businessName, businessPhone, businessAddress, businessTagline, slipSubtitle } = props;
  const slipNo = String(b.monthlySerial).padStart(2, "0");
  const initials = businessName.charAt(0).toUpperCase();
  const tagline = businessTagline || "Premium Cloth Rental — Elegance for Every Occasion";
  const displayAddress = businessAddress?.trim() || DEFAULT_ADDRESS;
  const displayPhone = businessPhone?.trim() || DEFAULT_PHONE;

  const deliveredDate = new Date(b.deliveredAt);
  const deliveredDateStr = deliveredDate.toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });
  const deliveredTimeStr = deliveredDate.toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit", hour12: true,
  });

  const balanceLeft = Math.max(0, b.totalRemaining - b.remainingCollected);
  const balanceFullyPaid = balanceLeft <= 0;

  const inclusiveRent = b.totalPrice;
  const taxableAmount = Math.round(inclusiveRent / (1 + GST_RATE / 100));
  const gstAmount = inclusiveRent - taxableAmount;
  const cgstAmount = Math.round(gstAmount / 2);
  const sgstAmount = gstAmount - cgstAmount;

  const half = Math.ceil(TERMS.length / 2);
  const termsLeft = TERMS.slice(0, half);
  const termsRight = TERMS.slice(half);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body > *:not(#delivery-slip-root) { display: none !important; }
          #delivery-slip-root { width: 210mm; min-height: 297mm; margin: 0 !important; padding: 0 !important; box-shadow: none !important; border-radius: 0 !important; }
          .slip-screen-only { display: none !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-break { page-break-inside: avoid; }
        }
        @media screen {
          #delivery-slip-root { max-width: 800px; margin: 0 auto; box-shadow: 0 4px 24px rgba(0,0,0,0.13); border-radius: 12px; overflow: hidden; }
        }
      ` }} />

      <div id="delivery-slip-root" className="slip-container" style={{ background: "#fff", fontFamily: "system-ui, -apple-system, sans-serif", color: "#1a1a1a" }}>

        {/* DELIVERED banner — top */}
        <div className="no-break" style={{
          background: `linear-gradient(135deg, ${GOLD}, #e8c96a)`,
          borderBottom: `3px solid ${G}`,
          padding: "14px 20px",
          textAlign: "center",
          boxShadow: "0 2px 12px rgba(201,168,76,0.4)",
        }}>
          <div style={{ fontSize: 26, fontWeight: 900, color: G, letterSpacing: "0.18em", textTransform: "uppercase" }}>
            ✓ DELIVERED
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#3d2e00", marginTop: 4 }}>
            Delivered on {deliveredDateStr} at {deliveredTimeStr}
          </div>
          {slipSubtitle && (
            <div style={{ fontSize: 11, fontWeight: 700, color: "#5c4a00", marginTop: 6, letterSpacing: "0.04em" }}>
              {slipSubtitle}
            </div>
          )}
        </div>

        {/* HEADER */}
        <div className="no-break" style={{ background: `linear-gradient(135deg, ${G} 0%, #2d8a45 100%)`, padding: "18px 24px 0 24px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", paddingBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flex: 1, minWidth: 0 }}>
              <div style={{
                width: 56, height: 56, borderRadius: "50%",
                border: `2.5px solid ${GOLD}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "rgba(255,255,255,0.1)", flexShrink: 0, marginTop: 2,
              }}>
                <span style={{ fontSize: 26, fontWeight: 900, color: GOLD, fontFamily: "Georgia, serif" }}>{initials}</span>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", fontFamily: "Georgia, serif", lineHeight: 1.2 }}>{businessName}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.95)", fontWeight: 700, marginTop: 3 }}>GSTIN: {GSTIN}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.92)", marginTop: 4, lineHeight: 1.45 }}>📍 {displayAddress}</div>
                <div style={{ fontSize: 12, color: GOLD, fontWeight: 700, marginTop: 4 }}>📞 {displayPhone}</div>
                <div style={{ fontSize: 11, color: GOLD, fontStyle: "italic", marginTop: 4 }}>{tagline}</div>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#fff", letterSpacing: "0.15em", textTransform: "uppercase" }}>DELIVERY SLIP</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: GOLD, marginTop: 2 }}>Slip #{slipNo}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", fontFamily: "monospace", marginTop: 3 }}>{b.publicBookingId}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.65)", marginTop: 2 }}>
                Booked: {new Date(b.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
              </div>
            </div>
          </div>
          <div style={{ height: 2, background: GOLD, margin: "0 -24px" }} />
        </div>

        {/* PROMINENT RETURN DATE — carry this slip at return */}
        <div className="no-break" style={{
          background: `linear-gradient(135deg, ${G} 0%, #145a24 100%)`,
          borderTop: `3px solid ${GOLD}`,
          borderBottom: `3px solid ${GOLD}`,
          padding: "18px 20px",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 11, color: GOLD, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase", marginBottom: 6 }}>
            🗓️ Please Return All Items By
          </div>
          <div style={{ fontSize: 32, fontWeight: 900, color: "#fff", fontFamily: "Georgia, serif", lineHeight: 1.1 }}>
            {b.returnDate}
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: GOLD, marginTop: 6 }}>{b.returnTime}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.9)", marginTop: 8, fontStyle: "italic" }}>
            ⚠️ Late returns attract additional rental charges per day
          </div>
        </div>

        {/* CUSTOMER + DATES */}
        <div className="no-break" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: "14px 16px" }}>
          <div style={{ background: LIGHT_GREEN, borderRadius: 10, borderLeft: `4px solid ${G}`, padding: "12px 14px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: G, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Customer Details</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {[
                  ["👤", "Name", <span key="n" style={{ fontWeight: 700, fontSize: 14 }}>{b.customerName}</span>],
                  ["📍", "Address", b.customerAddress],
                  ["📞", "Contact", b.contact1],
                  ...(b.whatsappNo ? [["💬", "WhatsApp", b.whatsappNo] as [string, string, string]] : []),
                  ["🏛️", "Venue", b.venue || "—"],
                  ["👨‍💼", "Staff", b.staffNames || "—"],
                ].map(([icon, label, value], i) => (
                  <tr key={i}>
                    <td style={{ width: 20, paddingBottom: 5, fontSize: 12, verticalAlign: "top" }}>{icon as string}</td>
                    <td style={{ width: 60, paddingBottom: 5, fontSize: 11, color: GREY, fontWeight: 600, verticalAlign: "top" }}>{label as string}</td>
                    <td style={{ paddingBottom: 5, fontSize: 12, verticalAlign: "top" }}>{value as ReactNode}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ background: BLUE, borderRadius: 10, padding: "12px 16px", boxShadow: "0 3px 10px rgba(21,101,192,0.25)" }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.8)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>
                🚚 Delivered On
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", fontFamily: "Georgia, serif" }}>{deliveredDateStr}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: GOLD, marginTop: 4 }}>{deliveredTimeStr}</div>
            </div>
            <div style={{ background: GOLD, borderRadius: 10, padding: "14px 16px", boxShadow: "0 4px 14px rgba(201,168,76,0.45)", border: `2px solid ${G}` }}>
              <div style={{ fontSize: 10, color: "#5a3800", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4, fontWeight: 800 }}>🔄 Return Date &amp; Time</div>
              <div style={{ fontSize: 26, fontWeight: 900, color: G, fontFamily: "Georgia, serif" }}>{b.returnDate}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: G, marginTop: 4 }}>{b.returnTime}</div>
              <div style={{ fontSize: 10, color: "#704f00", marginTop: 6, fontWeight: 600 }}>Mandatory return deadline</div>
            </div>
          </div>
        </div>

        {/* ITEMS */}
        <div className="no-break" style={{ padding: "0 16px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{ width: 4, height: 18, background: G, borderRadius: 2 }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: G, textTransform: "uppercase", letterSpacing: "0.08em" }}>Delivered Items</span>
          </div>
          <div style={{ borderRadius: 8, overflow: "hidden", border: `1px solid ${BORDER}` }}>
            <div style={{
              display: "grid", gridTemplateColumns: "28px 1fr 80px 52px 60px 70px 70px 68px",
              background: G, color: "#fff", fontSize: 10, fontWeight: 700, padding: "8px 10px", gap: 4,
            }}>
              <div>#</div><div>Item Name</div><div>Category</div><div>Size</div><div>Color</div>
              <div style={{ textAlign: "right" }}>Price</div>
              <div style={{ textAlign: "right" }}>Advance</div>
              <div style={{ textAlign: "right" }}>Balance</div>
            </div>
            {items.map((item, i) => (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "28px 1fr 80px 52px 60px 70px 70px 68px",
                background: i % 2 === 0 ? "#fff" : "#f9fbf9",
                borderBottom: "1px solid #e8f0e8", padding: "7px 10px", gap: 4, alignItems: "center", fontSize: 12,
              }}>
                <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#e8e8e8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: GREY, fontWeight: 600 }}>{i + 1}</div>
                <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.dressName}</div>
                <div><span style={{ fontSize: 10, background: "#e8f5e9", color: G, padding: "2px 6px", borderRadius: 10, fontWeight: 600 }}>{item.category || "—"}</span></div>
                <div><span style={{ fontSize: 10, background: "#f3f4f6", color: GREY, padding: "2px 6px", borderRadius: 10 }}>{item.size || "—"}</span></div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {item.color ? (
                    <>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", background: item.color.toLowerCase(), border: "1px solid #ccc", flexShrink: 0 }} />
                      <span style={{ fontSize: 10, color: GREY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.color}</span>
                    </>
                  ) : <span style={{ fontSize: 10, color: "#bbb" }}>—</span>}
                </div>
                <div style={{ textAlign: "right", fontWeight: 500 }}>{rs(item.price)}</div>
                <div style={{ textAlign: "right", color: SUCCESS, fontWeight: 500 }}>{rs(item.advance)}</div>
                <div style={{ textAlign: "right", fontWeight: 600, color: item.remaining > 0 ? "#d97706" : GREY }}>{rs(item.remaining)}</div>
              </div>
            ))}
            <div style={{
              display: "grid", gridTemplateColumns: "28px 1fr 80px 52px 60px 70px 70px 68px",
              background: LIGHT_GREEN, borderTop: `2px solid ${G}`, padding: "8px 10px", gap: 4, fontSize: 12, fontWeight: 700,
            }}>
              <div />
              <div style={{ gridColumn: "2 / 6", color: G, fontSize: 11, textTransform: "uppercase" }}>Total</div>
              <div style={{ textAlign: "right" }}>{rs(b.totalPrice)}</div>
              <div style={{ textAlign: "right", color: SUCCESS }}>{rs(b.totalAdvance)}</div>
              <div style={{ textAlign: "right", color: b.totalRemaining > 0 ? RED : G }}>{rs(b.totalRemaining)}</div>
            </div>
          </div>
        </div>

        {/* PAYMENT + QR */}
        <div className="no-break" style={{ display: "flex", gap: 16, padding: "0 16px 14px", alignItems: "flex-start" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 190, flexShrink: 0 }}>
            <div style={{
              background: "#fff", border: `2px solid ${G}`, borderRadius: 10, padding: 10,
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)", display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
            }}>
              <div style={{ fontSize: 10, color: G, fontWeight: 600 }}>🔒 Secure Delivery</div>
              {qrDataUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={qrDataUrl} alt="Delivery QR" width={175} height={175} style={{ display: "block" }} />
              ) : (
                <div style={{ width: 175, height: 175, background: "#f5f5f5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#999" }}>QR Not Available</div>
              )}
              <div style={{ fontSize: 9, color: GREY, textAlign: "center" }}>Scan for verification at return</div>
              <div style={{ background: "#e3f2fd", color: BLUE, fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20 }}>DELIVERED ✓</div>
              <div style={{ fontSize: 9, color: "#999", fontFamily: "monospace" }}>{b.publicBookingId}</div>
            </div>
          </div>

          <div style={{ flex: 1, border: `2px solid ${GOLD}`, borderRadius: 12, overflow: "hidden", boxShadow: "0 3px 12px rgba(201,168,76,0.2)" }}>
            <div style={{ background: G, padding: "8px 16px", textAlign: "center" }}>
              <span style={{ color: "#fff", fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>Delivery Payment Summary</span>
            </div>
            <div style={{ padding: "4px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 16px", borderBottom: `1px solid ${BORDER}` }}>
                <span style={{ fontSize: 13, color: GREY }}>Total Rental (Incl. GST @ {GST_RATE}%)</span>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{rs(inclusiveRent)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 16px", borderBottom: `1px solid ${BORDER}` }}>
                <span style={{ fontSize: 13, color: GREY }}>Advance Paid (at booking)</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: SUCCESS }}>{rs(b.totalAdvance)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 16px", borderBottom: `1px solid ${BORDER}`, background: "#fafafa" }}>
                <span style={{ fontSize: 12, color: GREY }}>Balance Due at Delivery</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{rs(b.totalRemaining)}</span>
              </div>

              {/* Balance paid — green highlight */}
              <div style={{ background: `linear-gradient(135deg, ${SUCCESS}, #2ecc71)`, padding: "14px 16px" }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.9)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, marginBottom: 4 }}>
                  Balance Paid by Customer at Delivery{payMode(b.remainingPaymentMode)}
                </div>
                <div style={{ fontSize: 26, fontWeight: 900, color: "#fff", fontFamily: "Georgia, serif" }}>{rs(b.remainingCollected)}</div>
              </div>

              {/* Balance left — red if pending, green if fully paid */}
              <div style={{
                background: balanceFullyPaid
                  ? `linear-gradient(135deg, ${SUCCESS}, #2ecc71)`
                  : `linear-gradient(135deg, ${RED}, #e74c3c)`,
                padding: "14px 16px",
              }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.9)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, marginBottom: 4 }}>
                  {balanceFullyPaid ? "Balance — Fully Paid ✓" : "Balance Still Pending"}
                </div>
                <div style={{ fontSize: 26, fontWeight: 900, color: "#fff", fontFamily: "Georgia, serif" }}>
                  {balanceFullyPaid ? "₹0" : rs(balanceLeft)}
                </div>
                {!balanceFullyPaid && (
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.85)", marginTop: 4 }}>Collect remaining balance from customer</div>
                )}
              </div>

              {/* Security deposited — blue highlight */}
              <div style={{ background: `linear-gradient(135deg, ${BLUE}, #42a5f5)`, padding: "14px 16px" }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.9)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, marginBottom: 4 }}>
                  Security Amount Deposited{payMode(b.securityPaymentMode)}
                </div>
                <div style={{ fontSize: 26, fontWeight: 900, color: "#fff", fontFamily: "Georgia, serif" }}>{rs(b.securityCollected)}</div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.85)", marginTop: 4 }}>
                  Refundable on return · Required: {rs(b.securityDeposit)}
                </div>
              </div>

              <div style={{ background: LIGHT_GREEN, borderTop: `2px solid ${G}`, padding: "10px 14px", borderRadius: "0 0 10px 10px" }}>
                <div style={{ fontSize: 9, fontWeight: 800, color: G, textTransform: "uppercase", marginBottom: 6, textAlign: "center" }}>GST Billing Details (Inclusive)</div>
                <div style={{ fontSize: 11, fontWeight: 700, textAlign: "center", lineHeight: 1.45 }}>
                  Rent {rs(inclusiveRent)} incl. GST @ {GST_RATE}% — Taxable: {rs(taxableAmount)} | GST: {rs(gstAmount)}
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: G, textAlign: "center", marginTop: 5 }}>
                  CGST @ 9%: {rs(cgstAmount)} &nbsp;•&nbsp; SGST @ 9%: {rs(sgstAmount)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* DELIVERY NOTE */}
        <div className="no-break" style={{ margin: "0 16px 14px", background: "#fff8e1", border: `2px solid ${GOLD}`, borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 18 }}>📋</span>
            <span style={{ fontSize: 12, fontWeight: 900, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.06em" }}>Delivery Note</span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#333", lineHeight: 1.55, fontStyle: b.deliveryNotes ? "normal" : "italic" }}>
            {b.deliveryNotes?.trim() || "No delivery note recorded."}
          </div>
        </div>

        {/* TERMS */}
        <div className="no-break" style={{ padding: "0 16px 12px" }}>
          <div style={{
            marginBottom: 12, background: `linear-gradient(135deg, ${RED}, #e74c3c)`,
            border: "2px solid #922b21", borderRadius: 8, padding: "12px 16px", textAlign: "center",
          }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: "#fff", letterSpacing: "0.06em", textTransform: "uppercase" }}>⚠️ NO CANCELLATION · NO REFUND</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{ flex: 1, height: 1, background: BORDER }} />
            <span style={{ fontSize: 11, fontWeight: 900, color: G, textTransform: "uppercase" }}>Terms &amp; Conditions</span>
            <div style={{ flex: 1, height: 1, background: BORDER }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px" }}>
            <div>
              {termsLeft.map((t, i) => (
                <div key={i} style={{ display: "flex", gap: 6, fontSize: 10, fontWeight: 700, lineHeight: 1.45, marginBottom: 5, background: "#fff8e1", border: "1px solid #f0c040", borderRadius: 4, padding: "6px 8px" }}>
                  <span style={{ fontWeight: 900, color: RED }}>{i + 1}.</span><span>{t}</span>
                </div>
              ))}
            </div>
            <div>
              {termsRight.map((t, i) => (
                <div key={i} style={{ display: "flex", gap: 6, fontSize: 10, fontWeight: 700, lineHeight: 1.45, marginBottom: 5, background: "#fff8e1", border: "1px solid #f0c040", borderRadius: 4, padding: "6px 8px" }}>
                  <span style={{ fontWeight: 900, color: RED }}>{half + i + 1}.</span><span>{t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div>
          <div style={{ height: 2, background: GOLD }} />
          <div style={{ background: G, padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 12, color: "#fff", fontStyle: "italic" }}>Thank you for choosing {businessName}! 🙏</div>
            <div style={{ textAlign: "right", fontSize: 10, color: "rgba(255,255,255,0.8)", lineHeight: 1.5 }}>
              <div>{displayPhone}</div>
              <div>{displayAddress}</div>
            </div>
          </div>
          <div style={{ textAlign: "center", fontSize: 9, color: "#999", padding: "6px 0" }}>This is a computer-generated delivery slip.</div>
        </div>
      </div>
    </>
  );
}

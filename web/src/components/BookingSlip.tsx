import type { ReactNode } from "react";
import { privateMediaUrl } from "@/lib/photoUrl";
import ZoomableImage from "@/components/ZoomableImage";
import SlipBrandTitle from "@/components/SlipBrandTitle";
import SlipLogo from "@/components/SlipLogo";
import SlipMottoBanner from "@/components/SlipMottoBanner";
import Emoji from "@/components/Emoji";
import PremiumSlipMarker from "@/components/PremiumSlipMarker";
import { WHATSAPP_CONTACT_LINE, WHATSAPP_TEAM_LINE, SLIP_TERMS } from "@/lib/slipConstants";

export type BookingSlipProps = {
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
    bookingDate: string;
    bookingTime: string;
    venue?: string | null;
    staffNames?: string | null;
    securityDeposit: number;
    totalPrice: number;
    totalAdvance: number;
    totalRemaining: number;
    commonNotes?: string | null;
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
    photoUrl?: string | null;
  }>;
  orders?: SlipOrderDisplay[];
  qrDataUrl?: string | null;
  businessName: string;
  businessPhone: string;
  businessAddress?: string;
  businessTagline?: string;
  printMode?: boolean;
};

export type SlipOrderDisplay = {
  description: string;
  cost: number;
  advance: number;
  balance: number;
  photo?: string | null;
  deliveryDate: string;
  deliveryTime: string;
  includedInRent: boolean;
};

/** Custom Orders block shared by booking & delivery slips. */
export function CustomOrdersSection({ orders, showPhoto = true, zoomable = false }: { orders?: SlipOrderDisplay[]; showPhoto?: boolean; zoomable?: boolean }) {
  if (!orders || orders.length === 0) return null;
  return (
    <div className="no-break" style={{ padding: "0 16px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{ width: 4, height: 18, background: GOLD, borderRadius: 2 }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: "#8a6d1a", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Custom Orders
        </span>
      </div>
      <div style={{ borderRadius: 8, overflow: "hidden", border: `1px solid ${BORDER}` }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "28px 1fr 120px 64px 66px 66px",
          background: "#8a6d1a",
          color: "#fff",
          fontSize: 10,
          fontWeight: 700,
          padding: "8px 10px",
          gap: 4,
        }}>
          <div>#</div>
          <div>Description</div>
          <div>Delivery</div>
          <div style={{ textAlign: "right" }}>Cost</div>
          <div style={{ textAlign: "right" }}>Advance</div>
          <div style={{ textAlign: "right" }}>Balance</div>
        </div>
        {orders.map((o, i) => (
          <div key={i} style={{
            display: "grid",
            gridTemplateColumns: "28px 1fr 120px 64px 66px 66px",
            background: i % 2 === 0 ? "#fff" : "#fffdf5",
            borderBottom: "1px solid #f0ead2",
            padding: "7px 10px",
            gap: 4,
            alignItems: "center",
            fontSize: 12,
          }}>
            <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#f0ead2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#8a6d1a", fontWeight: 600 }}>{i + 1}</div>
            <div>
              <div style={{ fontWeight: 600, color: "#1a1a1a" }}>{o.description}</div>
              {showPhoto && o.photo && privateMediaUrl(o.photo) ? (
                zoomable ? (
                  <ZoomableImage
                    src={privateMediaUrl(o.photo)!}
                    alt="Order sample"
                    overlayCaption={o.description}
                    style={{ marginTop: 4, maxHeight: 64, maxWidth: 90, borderRadius: 6, border: `1px solid ${BORDER}`, objectFit: "cover" }}
                  />
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={privateMediaUrl(o.photo)!} alt="Order sample" style={{ marginTop: 4, maxHeight: 64, maxWidth: 90, borderRadius: 6, border: `1px solid ${BORDER}`, objectFit: "cover" }} />
                )
              ) : null}
            </div>
            <div style={{ fontSize: 11, color: GREY }}>{o.deliveryDate}<br />{o.deliveryTime}</div>
            {o.includedInRent ? (
              <div style={{ gridColumn: "4 / 7", textAlign: "right", fontWeight: 700, color: "#8a6d1a" }}>Included in rent</div>
            ) : (
              <>
                <div style={{ textAlign: "right", fontWeight: 500 }}>{rs(o.cost)}</div>
                <div style={{ textAlign: "right", color: SUCCESS, fontWeight: 500 }}>{rs(o.advance)}</div>
                <div style={{ textAlign: "right", fontWeight: 600, color: o.balance > 0 ? "#d97706" : GREY }}>{rs(o.balance)}</div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const G = "#1a5c2a";
const GOLD = "#c9a84c";
const RED = "#c0392b";
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

const TERMS = SLIP_TERMS;

export default function BookingSlip(props: BookingSlipProps) {
  const { booking: b, items, orders, qrDataUrl, businessName, businessPhone, businessAddress } = props;
  const slipNo = String(b.monthlySerial).padStart(2, "0");
  const displayAddress = businessAddress?.trim() || DEFAULT_ADDRESS;
  const displayPhone = businessPhone?.trim() || DEFAULT_PHONE;
  const half = Math.ceil(TERMS.length / 2);
  const termsLeft = TERMS.slice(0, half);
  const termsRight = TERMS.slice(half);
  const outfitItems = items.filter((it) => it.photoUrl);

  const inclusiveRent = b.totalPrice;
  const taxableAmount = Math.round(inclusiveRent / (1 + GST_RATE / 100));
  const gstAmount = inclusiveRent - taxableAmount;
  const cgstAmount = Math.round(gstAmount / 2);
  const sgstAmount = gstAmount - cgstAmount;

  return (
    <>
      {/* ── Print Styles ─────────────────────────────────────── */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          .slip-page-wrap { padding: 0 !important; margin: 0 !important; background: #fff !important; min-height: 0 !important; }
          #booking-slip-root {
            width: 210mm;
            min-height: 0 !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            border-radius: 0 !important;
          }
          .slip-outfit-page {
            width: 210mm;
            min-height: 0 !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            page-break-before: always;
            break-before: page;
          }
          .slip-screen-only { display: none !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-break { page-break-inside: avoid; break-inside: avoid; }
          .page-break-before { page-break-before: always; }
        }
        @media screen {
          #booking-slip-root { max-width: 800px; margin: 0 auto; box-shadow: 0 4px 24px rgba(0,0,0,0.13); border-radius: 12px; overflow: hidden; }
          .slip-outfit-page { max-width: 800px; margin: 24px auto 0; box-shadow: 0 4px 24px rgba(0,0,0,0.13); border-radius: 12px; overflow: hidden; }
        }
      ` }} />

      <div id="booking-slip-root" style={{ background: "#fff", fontFamily: "system-ui, -apple-system, sans-serif", color: "#1a1a1a", position: "relative" }}>
        <PremiumSlipMarker kind="booking" />
        {/* ══════════════════════════════════════════
            SECTION 1: HEADER
        ══════════════════════════════════════════ */}
        <div className="no-break" style={{ background: `linear-gradient(135deg, ${G} 0%, #2d8a45 100%)`, padding: "18px 24px 0 24px", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", paddingBottom: 14 }}>
            {/* Left: Logo + Business Name + Address + Phone */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flex: 1, minWidth: 0 }}>
              <SlipLogo />
              <div style={{ minWidth: 0 }}>
                <SlipBrandTitle
                  name={businessName}
                  nameStyle={{
                    fontSize: 22,
                    fontWeight: 800,
                    color: "#fff",
                    fontFamily: "Georgia, serif",
                    letterSpacing: "0.01em",
                    lineHeight: 1.2,
                  }}
                  badgeStyle={{ fontSize: 11 }}
                />
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.95)", fontWeight: 700, marginTop: 3, letterSpacing: "0.04em" }}>
                  GSTIN: {GSTIN}
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.92)", marginTop: 4, lineHeight: 1.45, maxWidth: 380 }}>
                  <Emoji char="📍" /> {displayAddress}
                </div>
                <div style={{ fontSize: 12, color: GOLD, fontWeight: 700, marginTop: 4 }}>
                  <Emoji char="📞" /> {displayPhone}
                </div>
              </div>
            </div>

            {/* Right: Slip info */}
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#fff", letterSpacing: "0.15em", textTransform: "uppercase" }}>BOOKING SLIP</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: GOLD, marginTop: 2 }}>Slip #{slipNo}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", fontFamily: "monospace", marginTop: 3 }}>{b.publicBookingId}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.65)", marginTop: 2 }}>
                Issued: {new Date(b.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
              </div>
            </div>
          </div>

          {/* Gold divider */}
          <div style={{ height: 2, background: GOLD, margin: "0 -24px" }} />
          <SlipMottoBanner fullWidth style={{ margin: "0 -24px" }} />
        </div>

        {/* ══════════════════════════════════════════
            SECTION 2: CUSTOMER + DATE BAND
        ══════════════════════════════════════════ */}
        <div className="no-break" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: "14px 16px" }}>
          {/* Left: Customer Details */}
          <div style={{
            background: LIGHT_GREEN,
            borderRadius: 10,
            borderLeft: `4px solid ${G}`,
            padding: "12px 14px",
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: G, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Customer Details</div>

            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {[
                  ["👤", "Name", b.customerName, true],
                  ["📍", "Address", b.customerAddress, false],
                  ["📞", "Contact", b.contact1, false],
                  ...(b.whatsappNo ? [["💬", "WhatsApp", b.whatsappNo, false] as [string, string, string, boolean]] : []),
                  ["🏛️", "Venue", b.venue || "—", false],
                  ["👨‍💼", "Staff", b.staffNames || "—", false],
                ].map(([icon, label, value, bold], i) => (
                  <tr key={i}>
                    <td style={{ width: 20, paddingBottom: 5, fontSize: 12, verticalAlign: "top", paddingTop: 1 }}><Emoji char={String(icon)} /></td>
                    <td style={{ width: 60, paddingBottom: 5, fontSize: 11, color: GREY, fontWeight: 600, verticalAlign: "top", paddingTop: 1 }}>{label}</td>
                    <td style={{ paddingBottom: 5, fontSize: 12, verticalAlign: "top", paddingTop: 1 }}>
                      {bold ? <span style={{ fontWeight: 700, fontSize: 14, color: "#1a1a1a" }}>{value}</span> : value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Right: Booking + Pickup + Return Cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Booking date */}
            <div style={{
              background: "#fff",
              borderRadius: 10,
              border: `2px solid ${G}`,
              padding: "10px 16px",
              flex: 1,
            }}>
              <div style={{ fontSize: 10, color: G, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4, fontWeight: 700 }}>
                <Emoji char="📅" /> Date of Booking
              </div>
              <div style={{ fontSize: 18, fontWeight: 900, color: G, fontFamily: "Georgia, serif", lineHeight: 1.1 }}>{b.bookingDate}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: GREY, marginTop: 4 }}>{b.bookingTime}</div>
            </div>

            {/* Pickup */}
            <div style={{
              background: G,
              borderRadius: 10,
              padding: "12px 16px",
              flex: 1,
              boxShadow: "0 3px 10px rgba(26,92,42,0.25)",
            }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.75)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>
                <Emoji char="📦" /> Delivery Date &amp; Time
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", fontFamily: "Georgia, serif", lineHeight: 1.1 }}>{b.deliveryDate}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: GOLD, marginTop: 4 }}>{b.deliveryTime}</div>
            </div>

            {/* Return */}
            <div style={{
              background: GOLD,
              borderRadius: 10,
              padding: "12px 16px",
              flex: 1,
              boxShadow: "0 3px 10px rgba(201,168,76,0.35)",
            }}>
              <div style={{ fontSize: 10, color: "#5a3800", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>
                <Emoji char="🔄" /> Return Date &amp; Time
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, color: G, fontFamily: "Georgia, serif", lineHeight: 1.1 }}>{b.returnDate}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: G, marginTop: 4 }}>{b.returnTime}</div>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════
            SECTION 3: ITEMS TABLE
        ══════════════════════════════════════════ */}
        <div className="no-break" style={{ padding: "0 16px 14px" }}>
          {/* Section title */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{ width: 4, height: 18, background: G, borderRadius: 2 }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: G, textTransform: "uppercase", letterSpacing: "0.08em" }}>Booked Items</span>
          </div>

          <div style={{ borderRadius: 8, overflow: "hidden", border: `1px solid ${BORDER}` }}>
            {/* Header */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "28px 1fr 80px 52px 60px 70px 70px 68px",
              background: G,
              color: "#fff",
              fontSize: 10,
              fontWeight: 700,
              padding: "8px 10px",
              gap: 4,
            }}>
              <div>#</div>
              <div>Item Name</div>
              <div>Category</div>
              <div>Size</div>
              <div>Color</div>
              <div style={{ textAlign: "right" }}>Price</div>
              <div style={{ textAlign: "right" }}>Advance</div>
              <div style={{ textAlign: "right" }}>Balance</div>
            </div>

            {/* Rows */}
            {items.map((item, i) => (
              <div key={i} style={{
                display: "grid",
                gridTemplateColumns: "28px 1fr 80px 52px 60px 70px 70px 68px",
                background: i % 2 === 0 ? "#fff" : "#f9fbf9",
                borderBottom: `1px solid #e8f0e8`,
                padding: "7px 10px",
                gap: 4,
                alignItems: "center",
                fontSize: 12,
              }}>
                <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#e8e8e8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: GREY, fontWeight: 600 }}>{i + 1}</div>
                <div style={{ fontWeight: 600, color: "#1a1a1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.dressName}</div>
                <div>
                  <span style={{ fontSize: 10, background: "#e8f5e9", color: G, padding: "2px 6px", borderRadius: 10, fontWeight: 600, display: "inline-block" }}>
                    {item.category || "—"}
                  </span>
                </div>
                <div>
                  <span style={{ fontSize: 10, background: "#f3f4f6", color: GREY, padding: "2px 6px", borderRadius: 10, display: "inline-block" }}>
                    {item.size || "—"}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {item.color ? (
                    <>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", background: item.color.toLowerCase(), border: "1px solid #ccc", display: "inline-block", flexShrink: 0 }} />
                      <span style={{ fontSize: 10, color: GREY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.color}</span>
                    </>
                  ) : <span style={{ fontSize: 10, color: "#bbb" }}>—</span>}
                </div>
                <div style={{ textAlign: "right", fontWeight: 500 }}>{rs(item.price)}</div>
                <div style={{ textAlign: "right", color: SUCCESS, fontWeight: 500 }}>{rs(item.advance)}</div>
                <div style={{ textAlign: "right", fontWeight: 600, color: item.remaining > 0 ? "#d97706" : GREY }}>
                  {rs(item.remaining)}
                </div>
              </div>
            ))}

            {/* Totals row */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "28px 1fr 80px 52px 60px 70px 70px 68px",
              background: LIGHT_GREEN,
              borderTop: `2px solid ${G}`,
              padding: "8px 10px",
              gap: 4,
              fontSize: 12,
              fontWeight: 700,
            }}>
              <div />
              <div style={{ gridColumn: "2 / 6", color: G, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>Total</div>
              <div style={{ textAlign: "right", color: "#1a1a1a" }}>{rs(b.totalPrice)}</div>
              <div style={{ textAlign: "right", color: SUCCESS }}>{rs(b.totalAdvance)}</div>
              <div style={{ textAlign: "right", color: b.totalRemaining > 0 ? RED : G }}>{rs(b.totalRemaining)}</div>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════
            SECTION 3B: CUSTOM ORDERS
        ══════════════════════════════════════════ */}
        <CustomOrdersSection orders={orders} showPhoto={false} />

        {/* ══════════════════════════════════════════
            SECTION 4 + 5: PAYMENT SUMMARY + QR
        ══════════════════════════════════════════ */}
        <div className="no-break" style={{ display: "flex", gap: 16, padding: "0 16px 14px", alignItems: "flex-start" }}>

          {/* QR Code — left side (larger for easy scanning) */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 190, flexShrink: 0 }}>
            <div style={{
              background: "#fff",
              border: `2px solid ${G}`,
              borderRadius: 10,
              padding: 10,
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: G, fontWeight: 600 }}>
                <Emoji char="🔒" /> Secure Booking
              </div>
              {qrDataUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={qrDataUrl} alt="Booking QR" width={175} height={175} style={{ display: "block" }} />
              ) : (
                <div style={{ width: 175, height: 175, background: "#f5f5f5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#999", borderRadius: 4 }}>
                  QR Not Available
                </div>
              )}
              <div style={{ fontSize: 9, color: GREY, textAlign: "center", lineHeight: 1.3 }}>
                Scan for instant<br />verification at pickup
              </div>
              <div style={{ background: "#e8f5e9", color: G, fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20 }}>
                CONFIRMED <Emoji char="✅" />
              </div>
              <div style={{ fontSize: 9, color: "#999", fontFamily: "monospace" }}>{b.publicBookingId}</div>
            </div>
          </div>

          {/* Payment Summary — right side */}
          <div style={{ flex: 1, border: `2px solid ${GOLD}`, borderRadius: 12, overflow: "hidden", boxShadow: "0 3px 12px rgba(201,168,76,0.2)" }}>
            {/* Header */}
            <div style={{ background: G, padding: "8px 16px", textAlign: "center" }}>
              <span style={{ color: "#fff", fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>Payment Summary</span>
            </div>

            {/* Rows */}
            <div style={{ padding: "4px 0" }}>
              {/* Total Rental */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderBottom: `1px solid ${BORDER}` }}>
                <span style={{ fontSize: 13, color: GREY }}>Total Rental (Incl. GST @ {GST_RATE}%)</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>{rs(inclusiveRent)}</span>
              </div>

              {/* Advance Paid */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderBottom: `1px solid ${BORDER}` }}>
                <div style={{ fontSize: 13, color: GREY }}>Advance Paid</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, background: "#e8f5e9", color: SUCCESS, padding: "2px 8px", borderRadius: 12, fontWeight: 700 }}>PAID <Emoji char="✅" /></span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: SUCCESS }}>{rs(b.totalAdvance)}</span>
                </div>
              </div>

              {/* Balance Due — most prominent */}
              <div style={{
                background: `linear-gradient(135deg, ${RED}, #e74c3c)`,
                padding: "14px 16px",
              }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.85)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, marginBottom: 4 }}>
                  Amount to Bring on Pickup Day
                </div>
                <div style={{ fontSize: 26, fontWeight: 900, color: "#fff", fontFamily: "Georgia, serif" }}>
                  {rs(b.totalRemaining)}
                </div>
              </div>

              {/* Security Deposit — same highlighted style */}
              <div style={{
                background: `linear-gradient(135deg, ${RED}, #e74c3c)`,
                padding: "14px 16px",
              }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.85)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, marginBottom: 4 }}>
                  Security Amount to Bring on Pickup Day
                </div>
                <div style={{ fontSize: 26, fontWeight: 900, color: "#fff", fontFamily: "Georgia, serif" }}>
                  {rs(b.securityDeposit)}
                </div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.8)", marginTop: 4 }}>
                  Refundable on return of all items in original condition
                </div>
              </div>

              {/* GST Billing — 2 lines (inclusive, below security) */}
              <div style={{
                background: LIGHT_GREEN,
                borderTop: `2px solid ${G}`,
                padding: "10px 14px",
                borderRadius: "0 0 10px 10px",
              }}>
                <div style={{ fontSize: 9, fontWeight: 800, color: G, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6, textAlign: "center" }}>
                  GST Billing Details (Inclusive)
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#1a1a1a", lineHeight: 1.45, textAlign: "center" }}>
                  Rent {rs(inclusiveRent)} incl. GST @ {GST_RATE}% — Taxable: {rs(taxableAmount)} | GST: {rs(gstAmount)}
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: G, lineHeight: 1.45, textAlign: "center", marginTop: 5 }}>
                  CGST @ 9%: {rs(cgstAmount)} &nbsp;•&nbsp; SGST @ 9%: {rs(sgstAmount)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Payment note */}
        <div style={{ padding: "0 16px 12px", fontSize: 11, color: GREY, fontStyle: "italic", textAlign: "right" }}>
          <Emoji char="💡" /> Please bring exact change for balance and security amounts shown above.
        </div>

        {/* ══════════════════════════════════════════
            SECTION 7: NO CANCELLATION + TERMS
        ══════════════════════════════════════════ */}
        <div className="no-break" style={{ padding: "0 16px 8px" }}>
          {/* NO CANCELLATION banner */}
          <div style={{
            marginBottom: 8,
            background: `linear-gradient(135deg, ${RED}, #e74c3c)`,
            border: "2px solid #922b21",
            borderRadius: 8,
            padding: "12px 16px",
            textAlign: "center",
            boxShadow: "0 2px 10px rgba(192,57,43,0.35)",
          }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: "#fff", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              <Emoji char="⚠️" /> NO CANCELLATION · NO REFUND
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.95)", marginTop: 4 }}>
              All bookings are final once confirmed. Advance amount is non-refundable and non-adjustable.
            </div>
          </div>

          {/* Decorative header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{ flex: 1, height: 1, background: BORDER }} />
            <span style={{ fontSize: 11, fontWeight: 900, color: G, textTransform: "uppercase", letterSpacing: "0.1em", whiteSpace: "nowrap" }}>
              Terms &amp; Conditions
            </span>
            <div style={{ flex: 1, height: 1, background: BORDER }} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px" }}>
            <div>
              {termsLeft.map((t, i) => (
                <div key={i} style={{
                  display: "flex", gap: 6, fontSize: 10, fontWeight: 700, color: "#1a1a1a",
                  lineHeight: 1.45, marginBottom: 5,
                  background: "#fff8e1", border: "1px solid #f0c040", borderRadius: 4,
                  padding: "6px 8px",
                }}>
                  <span style={{ fontWeight: 900, color: RED, flexShrink: 0 }}>{i + 1}.</span>
                  <span>{t}</span>
                </div>
              ))}
            </div>
            <div>
              {termsRight.map((t, i) => (
                <div key={i} style={{
                  display: "flex", gap: 6, fontSize: 10, fontWeight: 700, color: "#1a1a1a",
                  lineHeight: 1.45, marginBottom: 5,
                  background: "#fff8e1", border: "1px solid #f0c040", borderRadius: 4,
                  padding: "6px 8px",
                }}>
                  <span style={{ fontWeight: 900, color: RED, flexShrink: 0 }}>{half + i + 1}.</span>
                  <span>{t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════
            SECTION 8: FOOTER
        ══════════════════════════════════════════ */}
        <div>
          {/* Gold divider */}
          <div style={{ height: 2, background: GOLD }} />

          {/* Footer band */}
          <div style={{ background: G, padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 11, color: "#fff", lineHeight: 1.5 }}>
              <div style={{ fontWeight: 800, letterSpacing: "0.04em" }}>{WHATSAPP_TEAM_LINE}</div>
              <div style={{ marginTop: 2, color: GOLD, fontWeight: 700 }}>{WHATSAPP_CONTACT_LINE}</div>
            </div>
            <div style={{ textAlign: "right", fontSize: 10, color: "rgba(255,255,255,0.8)", lineHeight: 1.5 }}>
              <div>{displayPhone}</div>
              <div>{displayAddress}</div>
            </div>
          </div>

          {/* Computer generated note */}
          <div style={{ textAlign: "center", fontSize: 9, color: "#999", padding: "6px 0", background: "#fff" }}>
            This is a computer-generated booking slip.
          </div>
        </div>

      </div>

      {/* ══════════════════════════════════════════
          FULL-PAGE OUTFIT PAGES (after bill, one dress per page)
      ══════════════════════════════════════════ */}
      {outfitItems.map((it, i) => (
        <div
          key={`outfit-${it.dressName}-${i}`}
          className="slip-outfit-page"
          style={{
            background: "#fff",
            fontFamily: "system-ui, -apple-system, sans-serif",
            color: "#1a1a1a",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ background: `linear-gradient(135deg, ${G} 0%, #2d8a45 100%)`, padding: "14px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: GOLD, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>
              Your Booked Outfit
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", fontFamily: "Georgia, serif" }}>{it.dressName}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.9)", marginTop: 4 }}>
              {it.category || "—"} · Size {it.size || "—"}{it.color ? ` · ${it.color}` : ""}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "10px 16px 8px", background: "#fafafa" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={it.photoUrl!}
              alt={it.dressName}
              style={{
                width: "100%",
                maxWidth: "178mm",
                maxHeight: props.printMode ? "220mm" : "70vh",
                objectFit: "contain",
                display: "block",
                borderRadius: 8,
                boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
              }}
            />
          </div>

          <div style={{ background: G, padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <SlipBrandTitle
              name={businessName}
              nameStyle={{ fontSize: 11, color: "#fff", fontWeight: 600 }}
              badgeStyle={{ fontSize: 8, padding: "2px 6px" }}
            />
            <div style={{ fontSize: 10, color: GOLD, fontFamily: "monospace" }}>{b.publicBookingId}</div>
          </div>
        </div>
      ))}
    </>
  );
}


import { CustomOrdersSection, type SlipOrderDisplay } from "@/components/BookingSlip";
import PremiumSlipMarker from "@/components/PremiumSlipMarker";
import SlipBrandTitle from "@/components/SlipBrandTitle";
import SlipLogo from "@/components/SlipLogo";
import SlipMottoBanner from "@/components/SlipMottoBanner";
import {
  SLIP_AMBER,
  SLIP_BORDER,
  SLIP_DARK,
  SLIP_DEFAULT_ADDRESS,
  SLIP_DEFAULT_PHONE,
  SLIP_GOLD,
  SLIP_GREEN,
  SLIP_GREY,
  SLIP_LIGHT_GREEN,
  SLIP_RED,
  SLIP_SUCCESS,
  SLIP_SINCE_LABEL,
  WHATSAPP_CONTACT_LINE,
  WHATSAPP_TEAM_LINE,
  itemReturnCondition,
  slipPadSerial,
  slipRs,
} from "@/lib/slipConstants";

export type ReturnSlipProps = {
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
    actualReturnDate?: string;
    actualReturnTime?: string;
    venue?: string | null;
    staffNames?: string | null;
    securityDeposit: number;
    totalPrice: number;
    totalAdvance: number;
    totalRemaining: number;
    remainingCollected?: number;
    securityRefunded?: number;
    lateFee?: number;
    damageCharge?: number;
    finalSettlement?: number;
    commonNotes?: string | null;
    returnNotes?: string | null;
    status: string;
    createdAt: string;
    isLateReturn?: boolean;
  };
  items: Array<{
    dressName: string;
    category: string;
    size: string;
    color?: string | null;
    sku?: string | null;
    photoUrl?: string | null;
    price: number;
    advance: number;
    remaining: number;
    returnCondition?: string;
    notes?: string | null;
    isCancelled?: boolean;
    cancelRefunded?: boolean;
  }>;
  orders?: SlipOrderDisplay[];
  qrDataUrl?: string | null;
  businessName: string;
  businessPhone: string;
  businessAddress?: string;
  printMode?: boolean;
  slipSubtitle?: string;
};

function normalizeCondition(raw?: string | null): "good" | "damaged" | "stained" {
  const input = (raw || "").toLowerCase().trim();
  if (input.includes("stain")) return "stained";
  if (input.includes("damage") || input.includes("tear") || input.includes("broken")) return "damaged";
  return "good";
}

export default function ReturnSlip(props: ReturnSlipProps) {
  const { booking: b, items, orders, qrDataUrl, businessName, businessPhone, businessAddress, slipSubtitle } = props;
  const slipNo = slipPadSerial(b.monthlySerial);
  const displayPhone = businessPhone?.trim() || SLIP_DEFAULT_PHONE;
  const displayAddress = businessAddress?.trim() || SLIP_DEFAULT_ADDRESS;
  const outfitItems = items.filter((it) => it.photoUrl);

  const remainingCollected = b.remainingCollected ?? 0;
  const securityRefunded = b.securityRefunded ?? 0;
  const lateFee = b.lateFee ?? 0;
  const damageCharge = b.damageCharge ?? 0;
  const computedSettlement = remainingCollected + lateFee + damageCharge - securityRefunded;
  const finalSettlement = b.finalSettlement ?? computedSettlement;

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
          @media print {
            .slip-page-wrap { padding: 0 !important; margin: 0 !important; background: #fff !important; min-height: 0 !important; }
            #return-slip-root {
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
            #return-slip-root.slip-container {
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
            .slip-responsive-table thead {
              display: none;
            }
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
            .slip-responsive-table td:last-child {
              border-bottom: none;
            }
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
        id="return-slip-root"
        className="slip-container"
        style={{
          fontFamily: "system-ui, -apple-system, sans-serif",
          position: "relative",
          color: SLIP_DARK,
          background: "#fff",
        }}
      >
        <PremiumSlipMarker kind="return" />
        <header
          style={{
            background: `linear-gradient(135deg, ${SLIP_GREEN} 0%, #2f8e49 100%)`,
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
              <div style={{ color: "#fff", fontSize: "clamp(15px, 2.4vw, 20px)", fontWeight: 900, letterSpacing: "0.08em" }}>
                RETURN RECEIPT
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
            background: "linear-gradient(135deg, #fff7e8 0%, #ffecc8 100%)",
            borderTop: `2px solid ${SLIP_GOLD}`,
            borderBottom: `2px solid ${SLIP_GOLD}`,
            padding: "12px clamp(12px, 2.5vw, 24px)",
            textAlign: "center",
            fontFamily: "Georgia, serif",
          }}
        >
          <div style={{ color: "#8a5a00", fontSize: "clamp(16px, 3vw, 23px)", fontWeight: 700 }}>
            ✦ Thank You For Returning With Care ✦
          </div>
          <div style={{ color: SLIP_GREY, marginTop: 4, fontSize: "clamp(11px, 1.9vw, 13px)" }}>
            {businessName} · {SLIP_SINCE_LABEL} appreciates your trust and timely return.
          </div>
          {slipSubtitle && (
            <div style={{ color: "#8a5a00", marginTop: 8, fontSize: "clamp(11px, 1.9vw, 12px)", fontWeight: 700 }}>
              {slipSubtitle}
            </div>
          )}
        </section>

        <section style={{ padding: "14px clamp(12px, 2.5vw, 24px)" }}>
          <div className="slip-two-col">
            <div
              style={{
                border: `1px solid ${SLIP_BORDER}`,
                borderLeft: `4px solid ${SLIP_GREEN}`,
                borderRadius: 10,
                background: SLIP_LIGHT_GREEN,
                padding: "12px 14px",
              }}
            >
              <div style={{ color: SLIP_GREEN, fontWeight: 800, fontSize: "clamp(11px, 1.9vw, 13px)", textTransform: "uppercase", marginBottom: 8 }}>
                Booking Summary
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 10px", fontSize: "clamp(12px, 2vw, 14px)" }}>
                <strong>Customer:</strong>
                <span>{b.customerName}</span>
                <strong>Contact:</strong>
                <span>{b.contact1}</span>
                <strong>Address:</strong>
                <span>{b.customerAddress}</span>
                <strong>Venue:</strong>
                <span>{b.venue || "—"}</span>
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
                Return Schedule
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 10px", fontSize: "clamp(12px, 2vw, 14px)" }}>
                <strong>Delivery:</strong>
                <span>
                  {b.deliveryDate} • {b.deliveryTime}
                </span>
                <strong>Due Return:</strong>
                <span>
                  {b.returnDate} • {b.returnTime}
                </span>
                <strong>Actual Return:</strong>
                <span>
                  {b.actualReturnDate || b.returnDate} • {b.actualReturnTime || b.returnTime}
                </span>
                <strong>Status:</strong>
                <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span>{b.status}</span>
                  {b.isLateReturn ? (
                    <span
                      style={{
                        background: "#fff3f2",
                        color: SLIP_RED,
                        border: `1px solid ${SLIP_RED}`,
                        borderRadius: 999,
                        padding: "2px 10px",
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      LATE RETURN
                    </span>
                  ) : null}
                </span>
              </div>
            </div>
          </div>
        </section>

        <section style={{ padding: "0 clamp(12px, 2.5vw, 24px) 14px" }}>
          <div
            style={{
              fontSize: "clamp(12px, 2vw, 14px)",
              fontWeight: 800,
              color: SLIP_GREEN,
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            Returned Items
          </div>
          <div style={{ border: `1px solid ${SLIP_BORDER}`, borderRadius: 10, overflow: "hidden" }}>
            <table className="slip-responsive-table">
              <thead>
                <tr style={{ background: SLIP_GREEN, color: "#fff" }}>
                  <th style={{ padding: "9px 10px", textAlign: "left", fontSize: 11 }}>#</th>
                  <th style={{ padding: "9px 10px", textAlign: "left", fontSize: 11 }}>Item</th>
                  <th style={{ padding: "9px 10px", textAlign: "left", fontSize: 11 }}>Category</th>
                  <th style={{ padding: "9px 10px", textAlign: "left", fontSize: 11 }}>Size</th>
                  <th style={{ padding: "9px 10px", textAlign: "left", fontSize: 11 }}>Condition</th>
                  <th style={{ padding: "9px 10px", textAlign: "right", fontSize: 11 }}>Price</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const isCancelled = item.isCancelled || item.returnCondition === "cancelled";
                  const normalized = isCancelled ? "good" : normalizeCondition(item.returnCondition);
                  const condition = isCancelled
                    ? "cancelled"
                    : itemReturnCondition({
                        isIncompleteReturn: normalized !== "good",
                        itemIncompleteNotes: normalized === "stained" ? "stain" : normalized,
                      });
                  const conditionColor =
                    condition === "cancelled"
                      ? SLIP_RED
                      : condition === "good"
                        ? SLIP_SUCCESS
                        : condition === "stained"
                          ? SLIP_AMBER
                          : SLIP_RED;
                  const conditionBg =
                    condition === "cancelled"
                      ? "#fff0ef"
                      : condition === "good"
                        ? "#ecf9f0"
                        : condition === "stained"
                          ? "#fff6e8"
                          : "#fff0ef";
                  const conditionLabel =
                    condition === "cancelled"
                      ? item.cancelRefunded
                        ? "Cancelled · Adv refunded"
                        : "Cancelled · Adv kept"
                      : condition;

                  return (
                    <tr
                      key={`${item.dressName}-${idx}`}
                      style={{ background: isCancelled ? "rgba(192,57,43,0.05)" : idx % 2 === 0 ? "#fff" : "#fafdfa" }}
                    >
                      <td data-label="#" style={{ padding: "9px 10px", fontSize: "clamp(11px, 1.8vw, 13px)" }}>
                        {idx + 1}
                      </td>
                      <td data-label="Item" style={{ padding: "9px 10px", fontSize: "clamp(11px, 1.8vw, 13px)", fontWeight: 600 }}>
                        {item.dressName}
                      </td>
                      <td data-label="Category" style={{ padding: "9px 10px", fontSize: "clamp(11px, 1.8vw, 13px)" }}>
                        {item.category || "—"}
                      </td>
                      <td data-label="Size" style={{ padding: "9px 10px", fontSize: "clamp(11px, 1.8vw, 13px)" }}>
                        {item.size || "—"}
                      </td>
                      <td data-label="Condition" style={{ padding: "9px 10px" }}>
                        <span
                          style={{
                            background: conditionBg,
                            color: conditionColor,
                            border: `1px solid ${conditionColor}`,
                            padding: "2px 10px",
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 700,
                            textTransform: "capitalize",
                          }}
                        >
                          {conditionLabel}
                        </span>
                      </td>
                      <td
                        data-label="Price"
                        style={{
                          padding: "9px 10px",
                          textAlign: "right",
                          fontWeight: 700,
                          fontSize: "clamp(11px, 1.8vw, 13px)",
                          textDecoration: isCancelled ? "line-through" : undefined,
                        }}
                      >
                        {slipRs(item.price)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <CustomOrdersSection orders={orders} showPhoto={false} />

        <section style={{ padding: "0 clamp(12px, 2.5vw, 24px) 14px" }}>
          <div
            style={{
              border: `2px solid ${SLIP_GOLD}`,
              borderRadius: 12,
              overflow: "hidden",
              background: "#fffdf7",
            }}
          >
            <div style={{ background: SLIP_GREEN, color: "#fff", textAlign: "center", fontWeight: 800, padding: "9px 12px", fontSize: "clamp(12px, 2vw, 14px)" }}>
              Final Settlement
            </div>
            <div style={{ padding: "10px 12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${SLIP_BORDER}` }}>
                <span style={{ color: SLIP_GREY }}>Total Booking Amount</span>
                <strong>{slipRs(b.totalPrice)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${SLIP_BORDER}` }}>
                <span style={{ color: SLIP_GREY }}>Advance Paid</span>
                <strong style={{ color: SLIP_SUCCESS }}>{slipRs(b.totalAdvance)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${SLIP_BORDER}` }}>
                <span style={{ color: SLIP_GREY }}>Remaining Collected</span>
                <strong>{slipRs(remainingCollected)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${SLIP_BORDER}` }}>
                <span style={{ color: SLIP_GREY }}>Security Refund</span>
                <strong>{slipRs(securityRefunded)}</strong>
              </div>
              {lateFee > 0 ? (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${SLIP_BORDER}` }}>
                  <span style={{ color: SLIP_RED }}>Late Fee</span>
                  <strong style={{ color: SLIP_RED }}>{slipRs(lateFee)}</strong>
                </div>
              ) : null}
              {damageCharge > 0 ? (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${SLIP_BORDER}` }}>
                  <span style={{ color: SLIP_AMBER }}>Damage Charge</span>
                  <strong style={{ color: SLIP_AMBER }}>{slipRs(damageCharge)}</strong>
                </div>
              ) : null}
              <div
                style={{
                  marginTop: 8,
                  borderRadius: 8,
                  background: finalSettlement >= 0 ? "#fff4f3" : "#edf9f0",
                  border: `1px solid ${finalSettlement >= 0 ? SLIP_RED : SLIP_SUCCESS}`,
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "10px 12px",
                }}
              >
                <span style={{ fontWeight: 800, color: finalSettlement >= 0 ? SLIP_RED : SLIP_SUCCESS }}>Net Settlement</span>
                <strong style={{ fontSize: "clamp(15px, 2.2vw, 18px)", color: finalSettlement >= 0 ? SLIP_RED : SLIP_SUCCESS }}>
                  {slipRs(Math.abs(finalSettlement))} {finalSettlement >= 0 ? "Collected" : "Refunded"}
                </strong>
              </div>
            </div>
          </div>
        </section>

        <section style={{ padding: "0 clamp(12px, 2.5vw, 24px) 14px" }}>
          <div className="slip-two-col">
            <div
              style={{
                border: `1px solid ${SLIP_BORDER}`,
                borderRadius: 10,
                padding: 12,
                textAlign: "center",
              }}
            >
              <div style={{ color: SLIP_GREEN, fontWeight: 800, fontSize: "clamp(11px, 1.9vw, 13px)", textTransform: "uppercase", marginBottom: 8 }}>
                Verification QR
              </div>
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrDataUrl} alt="Return QR" width={170} height={170} style={{ maxWidth: "100%", height: "auto", display: "block", margin: "0 auto" }} />
              ) : (
                <div
                  style={{
                    width: 170,
                    height: 170,
                    margin: "0 auto",
                    borderRadius: 8,
                    background: "#f3f4f6",
                    color: "#999",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                  }}
                >
                  QR Not Available
                </div>
              )}
              <div style={{ fontSize: 11, color: SLIP_GREY, marginTop: 8 }}>{b.publicBookingId}</div>
            </div>

            <div
              style={{
                border: `1px solid ${SLIP_BORDER}`,
                borderRadius: 10,
                padding: 12,
                background: "#fafcfa",
              }}
            >
              <div style={{ color: SLIP_GREEN, fontWeight: 800, fontSize: "clamp(11px, 1.9vw, 13px)", textTransform: "uppercase", marginBottom: 8 }}>
                Return Notes
              </div>
              <div style={{ fontSize: "clamp(12px, 2vw, 14px)", lineHeight: 1.5, color: SLIP_DARK }}>
                {b.returnNotes?.trim() || b.commonNotes?.trim() || "Items returned successfully. Thank you for choosing us."}
              </div>
              {b.staffNames ? (
                <div style={{ marginTop: 10, fontSize: "clamp(11px, 1.9vw, 13px)", color: SLIP_GREY }}>
                  Handled by: <strong>{b.staffNames}</strong>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section
          style={{
            margin: "0 clamp(12px, 2.5vw, 24px) 14px",
            background: `linear-gradient(135deg, ${SLIP_GREEN} 0%, #2e8a48 100%)`,
            borderRadius: 12,
            textAlign: "center",
            padding: "14px 12px",
          }}
        >
          <div style={{ color: "#fff", fontFamily: "Georgia, serif", fontWeight: 700, fontSize: "clamp(18px, 3vw, 24px)" }}>
            Come Back Soon
          </div>
          <div style={{ color: "rgba(255,255,255,0.9)", fontSize: "clamp(11px, 1.9vw, 13px)", marginTop: 4 }}>
            We look forward to styling your next special occasion.
          </div>
        </section>

        <footer>
          <div style={{ height: 2, background: SLIP_GOLD }} />
          <div
            style={{
              background: SLIP_GREEN,
              color: "#fff",
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              flexWrap: "wrap",
              padding: "10px clamp(12px, 2.5vw, 24px)",
            }}
          >
            <div style={{ fontSize: 11, lineHeight: 1.5 }}>
              <div style={{ fontWeight: 800, letterSpacing: "0.04em" }}>{WHATSAPP_TEAM_LINE}</div>
              <div style={{ marginTop: 2, color: SLIP_GOLD, fontWeight: 700 }}>{WHATSAPP_CONTACT_LINE}</div>
            </div>
            <div style={{ textAlign: "right", fontSize: "clamp(10px, 1.8vw, 12px)", color: "rgba(255,255,255,0.9)" }}>
              <div>{displayPhone}</div>
              <div>{displayAddress}</div>
            </div>
          </div>
          <div style={{ textAlign: "center", padding: "6px 10px", fontSize: 10, color: "#999" }}>
            This is a computer-generated return receipt.
          </div>
        </footer>
      </div>

      {outfitItems.map((it, idx) => (
        <div
          key={`${it.dressName}-${idx}`}
          className="slip-outfit-page no-break"
          style={{
            background: "#fff",
            fontFamily: "system-ui, -apple-system, sans-serif",
            marginTop: 16,
            borderRadius: 12,
            overflow: "hidden",
            border: `1px solid ${SLIP_BORDER}`,
          }}
        >
          <div style={{ background: SLIP_LIGHT_GREEN, padding: "12px 16px", borderBottom: `1px solid ${SLIP_BORDER}` }}>
            <div style={{ fontWeight: 800, color: SLIP_GREEN, fontSize: 13, textTransform: "uppercase" }}>
              Returned Item Reference
            </div>
            <div style={{ fontWeight: 700, fontSize: 16, marginTop: 4 }}>
              {it.dressName}
              {it.sku ? ` · ${it.sku}` : ""}
            </div>
            <div style={{ fontSize: 12, color: SLIP_GREY, marginTop: 2 }}>
              {it.category || "—"} · Size {it.size || "—"}
            </div>
          </div>
          <div style={{ padding: 16, textAlign: "center" }}>
            <img
              src={it.photoUrl!}
              alt={it.dressName}
              style={{ maxWidth: "100%", maxHeight: 420, objectFit: "contain", borderRadius: 8 }}
            />
          </div>
        </div>
      ))}
    </>
  );
}

import {
  premiumSlipMarker,
  premiumSlipMarkerProps,
  type PremiumSlipKind,
} from "@/lib/premiumSlip";

/**
 * Invisible marker embedded in PDF text for assertPremiumSlipPdf validation.
 * Must NOT use clip:rect(0) or display:none — Chromium omits those from print PDFs.
 */
export default function PremiumSlipMarker({ kind }: { kind: PremiumSlipKind }) {
  const marker = premiumSlipMarker(kind);
  return (
    <span
      {...premiumSlipMarkerProps(kind)}
      style={{
        position: "absolute",
        left: 0,
        bottom: 0,
        fontSize: "1px",
        lineHeight: "1px",
        color: "rgba(0,0,0,0.01)",
        opacity: 0.01,
        whiteSpace: "nowrap",
        pointerEvents: "none",
        userSelect: "none",
      }}
      aria-hidden
    >
      {marker}
    </span>
  );
}

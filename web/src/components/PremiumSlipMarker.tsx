import {
  premiumSlipMarker,
  premiumSlipMarkerProps,
  type PremiumSlipKind,
} from "@/lib/premiumSlip";

/** Invisible marker embedded in PDF text for assertPremiumSlipPdf validation. */
export default function PremiumSlipMarker({ kind }: { kind: PremiumSlipKind }) {
  const marker = premiumSlipMarker(kind);
  return (
    <span
      {...premiumSlipMarkerProps(kind)}
      style={{
        position: "absolute",
        width: 1,
        height: 1,
        overflow: "hidden",
        clip: "rect(0,0,0,0)",
        whiteSpace: "nowrap",
      }}
      aria-hidden
    >
      {marker}
    </span>
  );
}

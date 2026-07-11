import type { CSSProperties } from "react";
import { BRAND_APP_TITLE } from "@/lib/branding";
import { SLIP_GOLD, SLIP_LOGO_PATH } from "@/lib/slipConstants";

type SlipLogoProps = {
  size?: number;
  style?: CSSProperties;
};

/** Circular brand logo shown in slip header (replaces letter initial). */
export default function SlipLogo({ size = 56, style }: SlipLogoProps) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: `2.5px solid ${SLIP_GOLD}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#fff",
        flexShrink: 0,
        overflow: "hidden",
        marginTop: 2,
        ...style,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={SLIP_LOGO_PATH}
        alt={BRAND_APP_TITLE}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
        }}
      />
    </div>
  );
}

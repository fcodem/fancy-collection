import type { CSSProperties } from "react";
import { SLIP_GOLD, SLIP_GREEN, SLIP_SINCE_LABEL } from "@/lib/slipConstants";

export function SlipSinceBadge({ style }: { style?: CSSProperties }) {
  return (
    <span
      style={{
        display: "inline-block",
        background: SLIP_GOLD,
        color: SLIP_GREEN,
        fontWeight: 900,
        letterSpacing: "0.12em",
        fontSize: 10,
        padding: "3px 9px",
        borderRadius: 4,
        textTransform: "uppercase",
        boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {SLIP_SINCE_LABEL}
    </span>
  );
}

type SlipBrandTitleProps = {
  name: string;
  nameStyle?: CSSProperties;
  badgeStyle?: CSSProperties;
  wrapStyle?: CSSProperties;
};

export default function SlipBrandTitle({ name, nameStyle, badgeStyle, wrapStyle }: SlipBrandTitleProps) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, ...wrapStyle }}>
      <span style={nameStyle}>{name}</span>
      <SlipSinceBadge style={badgeStyle} />
    </div>
  );
}

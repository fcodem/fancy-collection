import type { CSSProperties } from "react";
import { SLIP_GOLD, SLIP_GREEN, SLIP_MOTTO_PARTS } from "@/lib/slipConstants";

type SlipMottoBannerProps = {
  /** Full-width strip below the header gold line (default on slips). */
  fullWidth?: boolean;
  /** `dark` = green slip header; `light` = white/postponed slip. */
  variant?: "dark" | "light";
  style?: CSSProperties;
};

function MottoPill({ variant, style }: { variant: "dark" | "light"; style?: CSSProperties }) {
  const onDark = variant === "dark";
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 0,
        padding: onDark ? "5px 14px" : "6px 18px",
        borderRadius: 999,
        border: `2px solid ${SLIP_GOLD}`,
        background: onDark
          ? "linear-gradient(90deg, rgba(201,168,76,0.32), rgba(255,255,255,0.14), rgba(201,168,76,0.32))"
          : "linear-gradient(90deg, #fff8e1, #fffef8, #fff8e1)",
        boxShadow: onDark
          ? "0 2px 10px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.2)"
          : "0 3px 12px rgba(201,168,76,0.35), inset 0 1px 0 rgba(255,255,255,0.9)",
        ...style,
      }}
    >
      {SLIP_MOTTO_PARTS.map((word, i) => (
        <span key={word} style={{ display: "inline-flex", alignItems: "center" }}>
          {i > 0 && (
            <span
              style={{
                color: onDark ? "rgba(255,255,255,0.55)" : SLIP_GOLD,
                fontWeight: 300,
                fontSize: onDark ? 14 : 15,
                padding: "0 8px",
                lineHeight: 1,
              }}
            >
              |
            </span>
          )}
          <span
            style={{
              fontSize: onDark ? 11 : 12,
              fontWeight: 900,
              letterSpacing: "0.22em",
              color: onDark ? SLIP_GOLD : SLIP_GREEN,
              textTransform: "uppercase",
              fontFamily: "Georgia, serif",
              textShadow: onDark ? "0 1px 2px rgba(0,0,0,0.35)" : "none",
            }}
          >
            {word}
          </span>
        </span>
      ))}
    </div>
  );
}

export default function SlipMottoBanner({
  fullWidth = false,
  variant = "dark",
  style,
}: SlipMottoBannerProps) {
  const onDark = variant === "dark";

  if (fullWidth) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          padding: "10px 16px 12px",
          background: onDark
            ? "linear-gradient(90deg, rgba(0,0,0,0.12), rgba(201,168,76,0.18), rgba(0,0,0,0.12))"
            : "linear-gradient(90deg, rgba(26,92,42,0.06), rgba(201,168,76,0.12), rgba(26,92,42,0.06))",
          borderTop: `1px solid ${onDark ? "rgba(201,168,76,0.45)" : "rgba(201,168,76,0.55)"}`,
          ...style,
        }}
      >
        <MottoPill variant={variant} />
      </div>
    );
  }

  return <MottoPill variant={variant} style={style} />;
}

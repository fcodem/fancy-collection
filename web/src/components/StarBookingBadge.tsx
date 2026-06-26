import type { CSSProperties } from "react";

export default function StarBookingBadge({ style }: { style?: CSSProperties }) {
  return (
    <i
      className="fa-solid fa-star"
      title="Star booking — rent above ₹3,000"
      style={{ color: "var(--gold)", marginLeft: 6, fontSize: "0.85em", ...style }}
      aria-label="Star booking"
    />
  );
}

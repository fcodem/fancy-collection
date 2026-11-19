import type { ReactNode } from "react";
import {
  groupSlipItemsForPrint,
  type PackingDivision,
} from "@/lib/packingDivision";

const DIVISION_COLORS: Record<PackingDivision, { bg: string; fg: string; border: string }> = {
  mens: { bg: "#e3f2fd", fg: "#0d47a1", border: "#90caf9" },
  womens: { bg: "#fce4ec", fg: "#880e4f", border: "#f48fb1" },
  jewellery: { bg: "#fff8e1", fg: "#e65100", border: "#ffcc80" },
};

type SlipGroupedItemRowsProps<T extends { category?: string | null; dressName?: string | null }> = {
  items: T[];
  /** Render one item row; `index` is 0-based across the whole slip. */
  renderItem: (item: T, index: number) => ReactNode;
  /** Optional table-style division/category headers (colSpan). */
  asTableRows?: boolean;
  tableColSpan?: number;
};

/**
 * Print slip rows grouped Men → Women → Jewellery, with a header above each
 * division and each dress category start.
 */
export default function SlipGroupedItemRows<
  T extends { category?: string | null; dressName?: string | null },
>({ items, renderItem, asTableRows = false, tableColSpan = 6 }: SlipGroupedItemRowsProps<T>) {
  const divisions = groupSlipItemsForPrint(items);
  let index = 0;
  const out: ReactNode[] = [];

  for (const div of divisions) {
    const colors = DIVISION_COLORS[div.division];
    if (asTableRows) {
      out.push(
        <tr key={`div-${div.division}`}>
          <td
            colSpan={tableColSpan}
            style={{
              background: colors.bg,
              color: colors.fg,
              borderBottom: `1px solid ${colors.border}`,
              padding: "8px 10px",
              fontSize: 12,
              fontWeight: 900,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {div.label}
          </td>
        </tr>,
      );
    } else {
      out.push(
        <div
          key={`div-${div.division}`}
          style={{
            background: colors.bg,
            color: colors.fg,
            borderBottom: `1px solid ${colors.border}`,
            padding: "8px 10px",
            fontSize: 12,
            fontWeight: 900,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {div.label}
        </div>,
      );
    }

    for (const cat of div.categories) {
      if (asTableRows) {
        out.push(
          <tr key={`cat-${div.division}-${cat.category}`}>
            <td
              colSpan={tableColSpan}
              style={{
                background: "#f7faf7",
                color: "#1a5c2a",
                borderBottom: "1px solid #d7e6d9",
                padding: "5px 10px 5px 14px",
                fontSize: 11,
                fontWeight: 800,
              }}
            >
              Category: {cat.category}
            </td>
          </tr>,
        );
      } else {
        out.push(
          <div
            key={`cat-${div.division}-${cat.category}`}
            style={{
              background: "#f7faf7",
              color: "#1a5c2a",
              borderBottom: "1px solid #d7e6d9",
              padding: "5px 10px 5px 14px",
              fontSize: 11,
              fontWeight: 800,
            }}
          >
            Category: {cat.category}
          </div>,
        );
      }

      for (const item of cat.items) {
        out.push(renderItem(item, index));
        index += 1;
      }
    }
  }

  return <>{out}</>;
}

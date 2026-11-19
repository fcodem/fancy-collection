"use client";

import Link from "next/link";
import { useEffect } from "react";
import { printWhenReady } from "@/components/print/PrintPaginator";

export default function AlternatePrintActions({
  date,
  autoPrint,
}: {
  date: string;
  autoPrint: boolean;
}) {
  useEffect(() => {
    if (autoPrint) printWhenReady();
  }, [autoPrint]);

  return (
    <div className="no-print bw-actions">
      <button type="button" className="bw-btn bw-btn-primary" onClick={() => window.print()}>
        <i className="fa-solid fa-print" /> Print
      </button>
      <form
        method="get"
        action="/dashboard/print/alternate"
        style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
      >
        <label style={{ fontSize: 12, fontWeight: 700 }}>
          Date{" "}
          <input
            type="date"
            name="date"
            defaultValue={date}
            style={{ marginLeft: 4, padding: "5px 8px", border: "1.5px solid #000", borderRadius: 4 }}
          />
        </label>
        <button type="submit" className="bw-btn">
          Load
        </button>
      </form>
      <Link href="/returning-today" className="bw-btn">
        Open Returning Today
      </Link>
      <Link href="/dashboard/print/deliveries" className="bw-btn">
        Pending deliveries
      </Link>
      <Link href="/" className="bw-btn">
        ← Dashboard
      </Link>
    </div>
  );
}

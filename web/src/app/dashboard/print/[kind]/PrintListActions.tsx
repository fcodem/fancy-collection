"use client";

import Link from "next/link";
import { useEffect } from "react";
import { printWhenReady } from "@/components/print/PrintPaginator";

export default function PrintListActions({
  kind,
  scope,
  autoPrint,
}: {
  kind: "deliveries" | "returns";
  scope: "due" | "all";
  autoPrint: boolean;
}) {
  useEffect(() => {
    if (autoPrint) printWhenReady();
  }, [autoPrint]);

  const base = `/dashboard/print/${kind}`;
  return (
    <div className="no-print bw-actions">
      <button type="button" className="bw-btn bw-btn-primary" onClick={() => window.print()}>
        <i className="fa-solid fa-print" /> Print
      </button>
      <Link href={`${base}?scope=due`} className={`bw-btn${scope === "due" ? " bw-btn-active" : ""}`}>
        Due today &amp; overdue
      </Link>
      <Link href={`${base}?scope=all`} className={`bw-btn${scope === "all" ? " bw-btn-active" : ""}`}>
        {kind === "deliveries" ? "All pending deliveries" : "All pending returns"}
      </Link>
      <Link href={kind === "deliveries" ? "/dashboard/print/returns" : "/dashboard/print/deliveries"} className="bw-btn">
        {kind === "deliveries" ? "Switch to returns" : "Switch to deliveries"}
      </Link>
      <Link href="/" className="bw-btn">← Dashboard</Link>
    </div>
  );
}

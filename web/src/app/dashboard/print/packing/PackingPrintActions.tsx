"use client";

import Link from "next/link";
import { useEffect } from "react";
import { printWhenReady } from "@/components/print/PrintPaginator";

export default function PackingPrintActions({ autoPrint }: { autoPrint: boolean }) {
  useEffect(() => {
    if (autoPrint) printWhenReady();
  }, [autoPrint]);

  return (
    <>
      <button type="button" className="bw-btn bw-btn-primary" onClick={() => window.print()}>
        <i className="fa-solid fa-print" /> Print
      </button>
      <Link href="/" className="bw-btn">← Dashboard</Link>
    </>
  );
}

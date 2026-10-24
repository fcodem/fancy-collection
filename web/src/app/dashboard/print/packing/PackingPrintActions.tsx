"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function PackingPrintActions({ autoPrint }: { autoPrint: boolean }) {
  useEffect(() => {
    if (!autoPrint) return;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
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

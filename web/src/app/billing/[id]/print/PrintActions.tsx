"use client";

import { useEffect } from "react";

export default function BillingPrintActions() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="no-print print-bill-actions">
      <button type="button" className="btn btn-primary" onClick={() => window.print()}>
        Print Invoice
      </button>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import PackingPrintActions from "./PackingPrintActions";

type Option = { value: string; label: string };

export default function PackingPrintFilters({
  from,
  to,
  category,
  divisionOptions,
  groups,
  autoPrint,
}: {
  from: string;
  to: string;
  category: string;
  divisionOptions: Option[];
  groups: Array<{ label: string; names: string[] }>;
  autoPrint: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [f, setF] = useState({ from, to, category });

  function apply(next: { from: string; to: string; category: string }) {
    const fixed = { ...next, to: next.to && next.to < next.from ? next.from : next.to };
    setF(fixed);
    if (!fixed.from || !fixed.to) return;
    const qs = new URLSearchParams({ from: fixed.from, to: fixed.to });
    if (fixed.category) qs.set("category", fixed.category);
    startTransition(() => router.replace(`/dashboard/print/packing?${qs.toString()}`));
  }

  return (
    <form
      className="pk-filters no-print"
      onSubmit={(e) => {
        e.preventDefault();
        apply(f);
      }}
    >
      <label>
        Delivery from
        <input type="date" value={f.from} onChange={(e) => apply({ ...f, from: e.target.value })} />
      </label>
      <label>
        Delivery to
        <input type="date" value={f.to} min={f.from} onChange={(e) => apply({ ...f, to: e.target.value })} />
      </label>
      <label>
        Category
        <select value={f.category} onChange={(e) => apply({ ...f, category: e.target.value })}>
          <option value="">All (Mens, Women, Jewellery)</option>
          <optgroup label="Full division">
            {divisionOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </optgroup>
          {groups.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.names.map((n) => (
                <option key={`${g.label}-${n}`} value={n}>{n}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <button type="submit" className="bw-btn" disabled={pending}>
        {pending ? "Updating…" : "Show list"}
      </button>
      <PackingPrintActions autoPrint={autoPrint} />
      {pending && <span style={{ fontSize: 12, fontWeight: 700 }}>Loading list…</span>}
    </form>
  );
}

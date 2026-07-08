"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import DressNameSuggestInput from "@/components/DressNameSuggestInput";

type Props = {
  q: string;
  status: string;
  showAdd: boolean;
};

export default function InventoryFilterBar({ q, status, showAdd }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState(q);
  const [statusVal, setStatusVal] = useState(status);

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (statusVal) params.set("status", statusVal);
    router.push(params.size ? `/inventory?${params.toString()}` : "/inventory");
  }

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div className="card-header">
        <h3 className="card-title">Manage Inventory</h3>
        {showAdd && (
          <Link href="/inventory/add" className="btn btn-primary btn-sm">
            Add Item
          </Link>
        )}
      </div>
      <div className="card-body">
        <form style={{ display: "flex", gap: 12, flexWrap: "wrap" }} onSubmit={submit}>
          <DressNameSuggestInput
            name="q"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onSuggestSelect={(item) => setQuery(item.sku || item.name)}
            placeholder="Search dress name or SKU…"
            style={{ flex: 1, minWidth: 200 }}
            showPhotos
          />
          <select
            name="status"
            value={statusVal}
            onChange={(e) => setStatusVal(e.target.value)}
            className="form-control"
          >
            <option value="">All Status</option>
            <option value="available">Available</option>
            <option value="rented">Rented</option>
            <option value="maintenance">Maintenance</option>
          </select>
          <button className="btn btn-primary" type="submit">
            Filter
          </button>
        </form>
      </div>
    </div>
  );
}

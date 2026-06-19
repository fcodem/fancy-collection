"use client";

import DressNameSuggestInput from "@/components/DressNameSuggestInput";

type Props = {
  q: string;
  status: string;
  showAdd: boolean;
};

export default function InventoryFilterBar({ q, status, showAdd }: Props) {
  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div className="card-header">
        <h3 className="card-title">Manage Inventory</h3>
        {showAdd && (
          <a href="/inventory/add" className="btn btn-primary btn-sm">
            Add Item
          </a>
        )}
      </div>
      <div className="card-body">
        <form style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <DressNameSuggestInput
            name="q"
            defaultValue={q}
            placeholder="Search dress name or SKU…"
            style={{ flex: 1, minWidth: 200 }}
            data-skip-dress-suggest="true"
          />
          <select name="status" defaultValue={status} className="form-control">
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


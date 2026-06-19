"use client";

import { useEffect, useState } from "react";
import DressNameSuggestInput from "@/components/DressNameSuggestInput";
import CategorySelect from "./CategorySelect";

export default function InventorySearchClient() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [photoResults, setPhotoResults] = useState<Array<Record<string, unknown>>>([]);

  async function search() {
    const res = await fetch(`/api/inventory/search?q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}`);
    const data = await res.json();
    setItems(data.items || []);
  }

  async function photoSearch(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("photo", file);
    form.append("category", category);
    const res = await fetch("/api/inventory/photo-search", { method: "POST", body: form });
    const data = await res.json();
    setPhotoResults(data.results || []);
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header"><h3 className="card-title">Dress Search</h3></div>
        <div className="card-body">
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 12, alignItems: "end" }}>
            <div><label className="form-label">Dress Name</label>
              <DressNameSuggestInput
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && search()}
                category={category}
                data-skip-dress-suggest="true"
              />
            </div>
            <div><label className="form-label">Category</label><CategorySelect value={category} onChange={setCategory} /></div>
            <div><label className="form-label">Photo Search</label><input type="file" accept="image/*" className="form-control" onChange={photoSearch} /></div>
            <button className="btn btn-primary" onClick={search}>Search</button>
          </div>
        </div>
      </div>

      {(items.length > 0 || photoResults.length > 0) && (
        <div className="card">
          <div className="card-body p-0">
            <table className="data-table">
              <thead><tr><th>SKU</th><th>Name</th><th>Category</th><th>Size</th><th>Status</th><th>Match</th></tr></thead>
              <tbody>
                {(photoResults.length ? photoResults : items).map((item) => (
                  <tr key={item.id as number}>
                    <td>{item.sku as string}</td>
                    <td><strong>{(item.display_name || item.name) as string}</strong></td>
                    <td>{item.category as string}</td>
                    <td>{(item.size as string) || "—"}</td>
                    <td><span className={`badge badge-${item.status}`}>{item.status as string}</span></td>
                    <td>{item.similarity ? `${item.similarity}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

export default function ManageCategoriesClient() {
  const [data, setData] = useState<{ custom_cats: Array<{ id: number; name: string; group: string }>; base: Record<string, string[]> } | null>(null);
  const [name, setName] = useState("");
  const [group, setGroup] = useState("other");

  async function load() {
    const res = await fetch("/api/categories");
    setData(await res.json());
  }

  useEffect(() => { load(); }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, group }) });
    setName("");
    load();
  }

  async function remove(id: number) {
    await fetch(`/api/categories/${id}`, { method: "POST" });
    load();
  }

  if (!data) return <div>Loading…</div>;

  return (
    <div>
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header"><h3 className="card-title">Add Custom Category</h3></div>
        <div className="card-body">
          <form onSubmit={add} style={{ display: "flex", gap: 12 }}>
            <input className="form-control" placeholder="Category name" value={name} onChange={(e) => setName(e.target.value)} required />
            <select className="form-control" value={group} onChange={(e) => setGroup(e.target.value)}>
              <option value="mens">Men&apos;s</option><option value="womens">Women&apos;s</option><option value="jewellery">Jewellery</option><option value="accessory">Accessory</option><option value="other">Other</option>
            </select>
            <button className="btn btn-primary">Add</button>
          </form>
        </div>
      </div>
      <div className="card">
        <div className="card-header"><h3 className="card-title">Custom Categories</h3></div>
        <div className="card-body p-0">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Group</th><th>Action</th></tr></thead>
            <tbody>
              {data.custom_cats.map((c) => (
                <tr key={c.id}><td>{c.name}</td><td>{c.group}</td><td><button className="btn btn-sm btn-outline" onClick={() => remove(c.id)}>Remove</button></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

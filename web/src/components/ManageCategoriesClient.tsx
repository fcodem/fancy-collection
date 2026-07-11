"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SaveConfirmedBanner } from "@/components/SaveConfirmedBanner";
import { buildSaveRedirectUrl } from "@/components/SaveConfirmedBanner";

type CategoryEntry = {
  name: string;
  group: string;
  id?: number;
  source: "base" | "custom";
  editable: boolean;
};

type SubCategoryRow = { id: number; name: string };

const GROUP_LABELS: Record<string, string> = {
  mens: "Men's",
  womens: "Women's",
  jewellery: "Jewellery",
  accessory: "Accessory",
  other: "Other",
};

const GROUP_ORDER = ["mens", "womens", "jewellery", "accessory", "other"];

export default function ManageCategoriesClient({
  saveConfirmed,
}: {
  saveConfirmed?: { title: string; detail?: string };
}) {
  const router = useRouter();
  const [groups, setGroups] = useState<Record<string, CategoryEntry[]> | null>(null);
  const [subCategories, setSubCategories] = useState<SubCategoryRow[]>([]);
  const [name, setName] = useState("");
  const [group, setGroup] = useState("other");
  const [subName, setSubName] = useState("");
  const [editingCatId, setEditingCatId] = useState<number | null>(null);
  const [editCatName, setEditCatName] = useState("");
  const [editCatGroup, setEditCatGroup] = useState("other");
  const [editingSubId, setEditingSubId] = useState<number | null>(null);
  const [editSubName, setEditSubName] = useState("");

  async function load() {
    try {
      const [catRes, subRes] = await Promise.all([
        fetch("/api/categories"),
        fetch("/api/sub-categories"),
      ]);
      if (catRes.ok) {
        const data = await catRes.json();
        setGroups(data.groups || {});
      }
      if (subRes.ok) {
        const data = await subRes.json();
        setSubCategories(data.sub_categories || []);
      }
    } catch {
      /* ignore transient network errors */
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    const catName = name.trim();
    if (!catName) return;
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: catName, group }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Failed to add category");
      return;
    }
    setName("");
    void load();
    router.replace(
      buildSaveRedirectUrl("/manage-categories", {
        title: "Category saved",
        detail: catName,
      }),
    );
    window.scrollTo(0, 0);
  }

  async function hideBaseCategory(catName: string) {
    if (!confirm(`Hide "${catName}" from category lists?`)) return;
    await fetch("/api/categories/hide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: catName }),
    });
    void load();
  }

  async function removeCustom(id: number) {
    if (!confirm("Remove this custom category?")) return;
    await fetch(`/api/categories/${id}`, { method: "POST" });
    void load();
  }

  function startEditCat(c: CategoryEntry) {
    setEditingCatId(c.id!);
    setEditCatName(c.name);
    setEditCatGroup(c.group);
  }

  async function saveEditCat() {
    if (editingCatId == null) return;
    await fetch(`/api/categories/${editingCatId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editCatName, group: editCatGroup }),
    });
    setEditingCatId(null);
    void load();
  }

  async function addSubCategory(e: React.FormEvent) {
    e.preventDefault();
    const label = subName.trim();
    if (!label) return;
    const res = await fetch("/api/sub-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: label }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Failed to add sub-category");
      return;
    }
    setSubName("");
    void load();
    router.replace(
      buildSaveRedirectUrl("/manage-categories", {
        title: "Sub-category saved",
        detail: label,
      }),
    );
    window.scrollTo(0, 0);
  }

  function startEditSub(s: SubCategoryRow) {
    setEditingSubId(s.id);
    setEditSubName(s.name);
  }

  async function saveEditSub() {
    if (editingSubId == null) return;
    await fetch(`/api/sub-categories/${editingSubId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editSubName }),
    });
    setEditingSubId(null);
    void load();
  }

  async function removeSub(id: number) {
    if (!confirm("Remove this sub-category?")) return;
    await fetch(`/api/sub-categories/${id}`, { method: "POST" });
    void load();
  }

  if (!groups) return <div>Loading…</div>;

  return (
    <div>
      {saveConfirmed && (
        <SaveConfirmedBanner
          title={saveConfirmed.title}
          detail={saveConfirmed.detail}
          hint="Add another category or sub-category below."
        />
      )}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header"><h3 className="card-title">Add Category</h3></div>
        <div className="card-body">
          <form onSubmit={addCategory} style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <input className="form-control" placeholder="Category name" value={name} onChange={(e) => setName(e.target.value)} required style={{ minWidth: 180 }} />
            <select className="form-control" value={group} onChange={(e) => setGroup(e.target.value)} style={{ minWidth: 140 }}>
              {GROUP_ORDER.map((g) => (
                <option key={g} value={g}>{GROUP_LABELS[g]}</option>
              ))}
            </select>
            <button className="btn btn-primary" type="submit">Add</button>
          </form>
        </div>
      </div>

      {GROUP_ORDER.map((g) => {
        const items = groups[g] || [];
        if (!items.length) return null;
        return (
          <div key={g} className="card" style={{ marginBottom: 24 }}>
            <div className="card-header">
              <h3 className="card-title">{GROUP_LABELS[g]} Categories</h3>
              <span className="badge badge-secondary">{items.length}</span>
            </div>
            <div className="card-body p-0">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((c) => (
                    <tr key={`${c.source}-${c.id ?? c.name}`}>
                      <td>
                        {editingCatId === c.id ? (
                          <input className="form-control" value={editCatName} onChange={(e) => setEditCatName(e.target.value)} />
                        ) : (
                          c.name
                        )}
                      </td>
                      <td>
                        {editingCatId === c.id ? (
                          <select className="form-control" value={editCatGroup} onChange={(e) => setEditCatGroup(e.target.value)}>
                            {GROUP_ORDER.map((gk) => (
                              <option key={gk} value={gk}>{GROUP_LABELS[gk]}</option>
                            ))}
                          </select>
                        ) : (
                          <span className={`badge ${c.source === "custom" ? "badge-info" : "badge-secondary"}`}>
                            {c.source === "custom" ? "Custom" : "Base"}
                          </span>
                        )}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {c.editable && editingCatId === c.id ? (
                          <>
                            <button className="btn btn-sm btn-primary" type="button" onClick={() => void saveEditCat()}>Save</button>{" "}
                            <button className="btn btn-sm btn-outline" type="button" onClick={() => setEditingCatId(null)}>Cancel</button>
                          </>
                        ) : c.editable ? (
                          <>
                            <button className="btn btn-sm btn-outline" type="button" onClick={() => startEditCat(c)}>Edit</button>{" "}
                            <button className="btn btn-sm btn-outline" type="button" onClick={() => void removeCustom(c.id!)}>Delete</button>
                          </>
                        ) : (
                          <button className="btn btn-sm btn-outline" type="button" onClick={() => void hideBaseCategory(c.name)}>Hide</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      <div className="card">
        <div className="card-header"><h3 className="card-title">Sub-Categories</h3></div>
        <div className="card-body">
          <form onSubmit={addSubCategory} style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
            <input className="form-control" placeholder="Sub-category name" value={subName} onChange={(e) => setSubName(e.target.value)} required style={{ minWidth: 200 }} />
            <button className="btn btn-primary" type="submit">Add</button>
          </form>
          <table className="data-table">
            <thead><tr><th>Name</th><th>Actions</th></tr></thead>
            <tbody>
              {subCategories.map((s) => (
                <tr key={s.id}>
                  <td>
                    {editingSubId === s.id ? (
                      <input className="form-control" value={editSubName} onChange={(e) => setEditSubName(e.target.value)} />
                    ) : (
                      s.name
                    )}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {editingSubId === s.id ? (
                      <>
                        <button className="btn btn-sm btn-primary" type="button" onClick={() => void saveEditSub()}>Save</button>{" "}
                        <button className="btn btn-sm btn-outline" type="button" onClick={() => setEditingSubId(null)}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button className="btn btn-sm btn-outline" type="button" onClick={() => startEditSub(s)}>Edit</button>{" "}
                        <button className="btn btn-sm btn-outline" type="button" onClick={() => void removeSub(s.id)}>Delete</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

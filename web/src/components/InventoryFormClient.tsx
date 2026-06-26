"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import DressNameSuggestInput from "@/components/DressNameSuggestInput";
import { photoUrl } from "@/lib/photoUrl";
import { BASE_MENS, BASE_WOMENS, BASE_JEWELLERY, BASE_ACCESSORY, SIZES, MENS_CATEGORIES } from "@/lib/constants";

const ALL_CATS = [...BASE_MENS, ...BASE_WOMENS, ...BASE_JEWELLERY, ...BASE_ACCESSORY];

export default function InventoryFormClient({ item }: { item?: Record<string, unknown> }) {
  const router = useRouter();
  const [category, setCategory] = useState((item?.category as string) || "");
  const [name, setName] = useState((item?.name as string) || "");
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [photoPreview, setPhotoPreview] = useState("");
  const [subCategories, setSubCategories] = useState<string[]>(["Normal"]);
  const isEdit = Boolean(item?.id);
  const isMens = MENS_CATEGORIES.includes(category);
  const existingPhoto = photoUrl(item?.photo as string | undefined);

  useEffect(() => {
    fetch("/api/sub-categories")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.sub_categories?.length) {
          setSubCategories(data.sub_categories.map((s: { name: string }) => s.name));
        }
      })
      .catch(() => {});
  }, []);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setPhotoPreview("");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setPhotoPreview(reader.result);
    };
    reader.readAsDataURL(file);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.currentTarget);
    if (!isEdit && isMens) selectedSizes.forEach((s) => form.append("sizes[]", s));
    const url = isEdit ? `/api/inventory/${item!.id}` : "/api/inventory";
    const res = await fetch(url, { method: isEdit ? "PUT" : "POST", body: form, credentials: "same-origin" });
    setSaving(false);
    if (res.ok) router.push("/inventory");
    else alert((await res.json()).error || "Failed");
  }

  return (
    <form onSubmit={submit} encType="multipart/form-data" className="card">
      <div className="card-header"><h3 className="card-title">{isEdit ? "Edit Item" : "Add Item"}</h3></div>
      <div className="card-body" style={{ display: "grid", gap: 16, maxWidth: 600 }}>
        <div><label className="form-label">Name *</label>
          <DressNameSuggestInput
            name="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            onSuggestSelect={(item) => setName(item.name)}
            category={category}
            showPhotos
          />
        </div>
        <div><label className="form-label">Category *</label>
          <select id="invCategory" name="category" className="form-control" required value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Select…</option>
            {ALL_CATS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {isMens && !isEdit ? (
          <div><label className="form-label">Sizes *</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {SIZES.map((s) => (
                <label key={s} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <input type="checkbox" checked={selectedSizes.includes(s)} onChange={(e) => setSelectedSizes(e.target.checked ? [...selectedSizes, s] : selectedSizes.filter((x) => x !== s))} />{s}
                </label>
              ))}
            </div>
          </div>
        ) : (
          <div><label className="form-label">Size</label><input name="size" className="form-control" defaultValue={item?.size as string} /></div>
        )}
        <div><label className="form-label">Color</label><input name="color" className="form-control" defaultValue={item?.color as string} /></div>
        {!isEdit && (
          <div><label className="form-label">Quantity</label>
            <input name="quantity" type="number" min={1} max={50} defaultValue={1} className="form-control" />
            <small className="text-muted">Each unit is a separate bookable item (named #1, #2, … when quantity &gt; 1).</small>
          </div>
        )}
        <div><label className="form-label">Daily Rate (₹)</label><input name="daily_rate" type="number" className="form-control" defaultValue={item?.dailyRate as number} /></div>
        <div><label className="form-label">Deposit (₹)</label><input name="deposit" type="number" className="form-control" defaultValue={item?.deposit as number} /></div>
        <div><label className="form-label">Sub-Category</label>
          <select name="sub_category" className="form-control" defaultValue={(item?.subCategory as string) || "Normal"}>
            {subCategories.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {isEdit && (
          <div><label className="form-label">Status</label>
            <select name="status" className="form-control" defaultValue={item?.status as string}>
              <option value="available">Available</option><option value="rented">Rented</option><option value="maintenance">Maintenance</option>
            </select>
          </div>
        )}
        <div><label className="form-label">Condition Notes</label><textarea name="condition_notes" className="form-control" defaultValue={item?.conditionNotes as string} /></div>
        <div>
          <label className="form-label">Photo</label>
          <input name="photo" type="file" accept="image/*" className="form-control" onChange={handlePhotoChange} />
          {(photoPreview || existingPhoto) && (
            <div className="inv-form-photo-preview">
              <img
                src={photoPreview || existingPhoto}
                alt="Stock preview"
                className="inv-form-photo-img"
              />
              <span className="inv-form-photo-label">
                {photoPreview ? "New photo preview" : "Current photo"}
              </span>
            </div>
          )}
        </div>
        <button className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : isEdit ? "Update" : "Add Item"}</button>
      </div>
    </form>
  );
}

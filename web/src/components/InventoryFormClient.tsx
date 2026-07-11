"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { type CatalogPhotoItem } from "@/lib/catalogPhotoUrl";
import { BASE_MENS, BASE_WOMENS, BASE_JEWELLERY, BASE_ACCESSORY, SIZES, MENS_CATEGORIES, JEWELLERY_CATEGORIES } from "@/lib/constants";
import { formatJewelleryPartsLabel, partsPresentOnItem } from "@/lib/jewelleryParts";
import { useToast } from "@/components/ui/Toast";
import { SaveConfirmedBanner } from "@/components/SaveConfirmedBanner";
import { buildSaveRedirectUrl } from "@/components/SaveConfirmedBanner";

type InventoryFormItem = CatalogPhotoItem & {
  id?: number;
  name?: string;
  category?: string;
  size?: string | null;
  color?: string | null;
  dailyRate?: number;
  deposit?: number;
  subCategory?: string | null;
  status?: string;
  conditionNotes?: string | null;
  hasNecklace?: boolean;
  hasEarrings?: boolean;
  hasTeeka?: boolean;
  hasPasa?: boolean;
};

type SaveConfirmed = {
  sku: string;
  name: string;
  count: number;
};

export default function InventoryFormClient({
  item,
  initialPhotoUrl = "",
  saveConfirmed,
}: {
  item?: InventoryFormItem;
  initialPhotoUrl?: string;
  saveConfirmed?: SaveConfirmed;
}) {
  const router = useRouter();
  const toast = useToast();
  const [category, setCategory] = useState(item?.category || "");
  const [name, setName] = useState(item?.name || "");
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [hasNecklace, setHasNecklace] = useState(Boolean(item?.hasNecklace));
  const [hasEarrings, setHasEarrings] = useState(Boolean(item?.hasEarrings));
  const [hasTeeka, setHasTeeka] = useState(Boolean(item?.hasTeeka));
  const [hasPasa, setHasPasa] = useState(Boolean(item?.hasPasa));
  const [saving, setSaving] = useState(false);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<{
    sku: string;
    name: string;
    similarity: number;
  } | null>(null);
  const [pendingForm, setPendingForm] = useState<FormData | null>(null);
  const [localPreview, setLocalPreview] = useState("");
  const [photoUrl, setPhotoUrl] = useState(initialPhotoUrl || "");
  const [subCategories, setSubCategories] = useState<string[]>(["Normal"]);
  const isEdit = Boolean(item?.id);
  const isMens = MENS_CATEGORIES.includes(category);
  const isJewellery = JEWELLERY_CATEGORIES.includes(category);

  const displayPhoto = localPreview || photoUrl;

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
      setLocalPreview("");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setLocalPreview(reader.result);
    };
    reader.readAsDataURL(file);
  }

  const resetFormForNewItem = useCallback(() => {
    setCategory("");
    setName("");
    setSelectedSizes([]);
    setHasNecklace(false);
    setHasEarrings(false);
    setHasTeeka(false);
    setHasPasa(false);
    setLocalPreview("");
    setPhotoUrl("");
    setDuplicateWarning(null);
    setPendingForm(null);
  }, []);

  async function saveForm(form: FormData, url: string, method: string) {
    setSaving(true);
    const res = await fetch(url, { method, body: form, credentials: "same-origin" });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      alert(data.error || "Failed");
      return;
    }

    if (!isEdit) {
      const count = Number(data.count) || 1;
      const sku = String(data.sku || "");
      const savedName = String(data.name || form.get("name") || "");
      toast(count > 1 ? `Inventory saved — ${count} items added` : "Inventory saved", "success");
      resetFormForNewItem();
      const params = new URLSearchParams({ saved: "1", count: String(count) });
      if (sku) params.set("sku", sku);
      if (savedName) params.set("name", savedName);
      router.replace(`/inventory/add?${params.toString()}`);
      router.refresh();
      window.scrollTo(0, 0);
      return;
    }

    const hadPhoto = form.get("photo") instanceof File && (form.get("photo") as File).size > 0;
    const savedPhotoUrl = data.original_photo_url || data.display_photo_url || "";

    if (hadPhoto && savedPhotoUrl) {
      setLocalPreview("");
      setPhotoUrl(savedPhotoUrl);
      toast("Inventory updated", "success");
      return;
    }

    toast("Inventory updated", "success");
    router.push("/inventory");
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (!isEdit && isMens) selectedSizes.forEach((s) => form.append("sizes[]", s));
    if (isJewellery) {
      if (hasNecklace) form.set("has_necklace", "1");
      if (hasEarrings) form.set("has_earrings", "1");
      if (hasTeeka) form.set("has_teeka", "1");
      if (hasPasa) form.set("has_pasa", "1");
    }

    const url = isEdit ? `/api/inventory/${item!.id}` : "/api/inventory";
    const method = isEdit ? "PUT" : "POST";
    const photo = form.get("photo");

    if (!isEdit && photo instanceof File && photo.size > 0 && category) {
      setCheckingDuplicate(true);
      const dupForm = new FormData();
      dupForm.append("photo", photo);
      dupForm.append("category", category);
      try {
        const dupRes = await fetch("/api/inventory/duplicate-check", {
          method: "POST",
          body: dupForm,
          credentials: "same-origin",
        });
        const dupData = await dupRes.json().catch(() => ({}));
        if (dupRes.ok && dupData.is_duplicate && dupData.match) {
          setDuplicateWarning({
            sku: dupData.match.sku,
            name: dupData.match.name,
            similarity: dupData.match.similarity,
          });
          setPendingForm(form);
          setCheckingDuplicate(false);
          return;
        }
      } catch {
        // proceed if duplicate check fails
      }
      setCheckingDuplicate(false);
    }

    await saveForm(form, url, method);
  }

  async function confirmDuplicateSave() {
    if (!pendingForm) return;
    const url = "/api/inventory";
    setDuplicateWarning(null);
    await saveForm(pendingForm, url, "POST");
    setPendingForm(null);
  }

  return (
    <form onSubmit={submit} encType="multipart/form-data" className="card">
      {saveConfirmed && !isEdit && (
        <SaveConfirmedBanner
          title="Inventory saved"
          detail={
            saveConfirmed.count > 1
              ? `${saveConfirmed.count} items added successfully`
              : saveConfirmed.sku || saveConfirmed.name
          }
          hint="Enter the next item below."
        />
      )}
      <div className="card-header"><h3 className="card-title">{isEdit ? "Edit Item" : "Add Item"}</h3></div>
      <div className="card-body" style={{ display: "grid", gap: 16, maxWidth: 600 }}>
        <div><label className="form-label">Name *</label>
          <input
            type="text"
            name="name"
            className="form-control"
            required
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div><label className="form-label">Category *</label>
          <select id="invCategory" name="category" className="form-control" required value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Select…</option>
            <optgroup label="Men's">
              {BASE_MENS.map((c) => <option key={c} value={c}>{c}</option>)}
            </optgroup>
            <optgroup label="Women's">
              {BASE_WOMENS.map((c) => <option key={c} value={c}>{c}</option>)}
            </optgroup>
            <optgroup label="Jewellery">
              {BASE_JEWELLERY.map((c) => <option key={c} value={c}>{c}</option>)}
            </optgroup>
            <optgroup label="Accessories">
              {BASE_ACCESSORY.map((c) => <option key={c} value={c}>{c}</option>)}
            </optgroup>
          </select>
        </div>
        {isJewellery && (
          <div>
            <label className="form-label">Set includes (tick what is present in this jewellery)</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 8 }}>
              <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input type="checkbox" checked={hasNecklace} onChange={(e) => setHasNecklace(e.target.checked)} />
                Necklace present
              </label>
              <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input type="checkbox" checked={hasEarrings} onChange={(e) => setHasEarrings(e.target.checked)} />
                Earrings present
              </label>
              <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input type="checkbox" checked={hasTeeka} onChange={(e) => setHasTeeka(e.target.checked)} />
                Teeka present
              </label>
              <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input type="checkbox" checked={hasPasa} onChange={(e) => setHasPasa(e.target.checked)} />
                Pasa present
              </label>
            </div>
            <small className="text-muted" style={{ display: "block", marginTop: 8 }}>
              Parts can be booked separately to different customers.{" "}
              {partsPresentOnItem({ hasNecklace, hasEarrings, hasTeeka, hasPasa }).length > 0 && (
                <span>Set: {formatJewelleryPartsLabel(partsPresentOnItem({ hasNecklace, hasEarrings, hasTeeka, hasPasa }))}</span>
              )}
            </small>
          </div>
        )}
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
          <div><label className="form-label">Size</label><input name="size" className="form-control" defaultValue={item?.size ?? ""} /></div>
        )}
        <div><label className="form-label">Color</label><input name="color" className="form-control" defaultValue={item?.color ?? ""} /></div>
        {!isEdit && (
          <div><label className="form-label">Quantity</label>
            <input name="quantity" type="number" min={1} max={50} defaultValue={1} className="form-control" />
            <small className="text-muted">Each unit is a separate bookable item (named #1, #2, … when quantity &gt; 1).</small>
          </div>
        )}
        <div><label className="form-label">Daily Rate (₹)</label><input name="daily_rate" type="number" className="form-control" defaultValue={item?.dailyRate} /></div>
        <div><label className="form-label">Deposit (₹)</label><input name="deposit" type="number" className="form-control" defaultValue={item?.deposit} /></div>
        <div><label className="form-label">Sub-Category</label>
          <select name="sub_category" className="form-control" defaultValue={item?.subCategory ?? "Normal"}>
            {subCategories.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {isEdit && (
          <div><label className="form-label">Status</label>
            <select name="status" className="form-control" defaultValue={item?.status}>
              <option value="available">Available</option><option value="rented">Rented</option><option value="maintenance">Maintenance</option>
            </select>
          </div>
        )}
        <div><label className="form-label">Condition Notes</label><textarea name="condition_notes" className="form-control" defaultValue={item?.conditionNotes ?? ""} /></div>
        <div>
          <label className="form-label">Photo</label>
          <input name="photo" type="file" accept="image/*" className="form-control" onChange={handlePhotoChange} />
          {displayPhoto ? (
            <div className="inv-form-photo-preview">
              <img
                key={displayPhoto}
                src={displayPhoto}
                alt="Stock preview"
                className="inv-form-photo-img"
              />
              <span className="inv-form-photo-label">Uploaded image</span>
            </div>
          ) : (
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
              Select a photo to see an instant preview.
            </p>
          )}
        </div>
        <button className="btn btn-primary" disabled={saving || checkingDuplicate}>
          {checkingDuplicate ? "Checking for duplicates…" : saving ? "Saving…" : isEdit ? "Update" : "Add Item"}
        </button>
      </div>
      {duplicateWarning && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div className="card" style={{ maxWidth: 420, margin: 16 }}>
            <div className="card-header">
              <h3 className="card-title">Possible duplicate inventory item</h3>
            </div>
            <div className="card-body">
              <p>
                This appears to be the same dress as <strong>{duplicateWarning.name}</strong> (
                {duplicateWarning.sku}) — {duplicateWarning.similarity}% fingerprint match.
              </p>
              <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Continue adding as a new item?</p>
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button type="button" className="btn btn-primary" onClick={() => void confirmDuplicateSave()}>
                  Continue
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setDuplicateWarning(null);
                    setPendingForm(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BookingRecordDetails } from "@/components/BookingRecordDetails";
import { BookingWarningPanel } from "@/components/BookingDetailsColumns";
import { WARNING_BOOKED_ON_RETURN, WARNING_RETURNING_ON_DELIVERY, type BookingWarningRecord } from "@/lib/bookingDetails";

function buildStoredNote(warning: string | null, userNote: string | null): string | null {
  const parts = [warning, userNote?.trim()].filter(Boolean) as string[];
  return parts.length ? parts.join(" · ") : null;
}

function NoteLines({ note }: { note: string }) {
  const parts = note.split(" · ").filter(Boolean);
  return (
    <>
      {parts.map((p, i) => {
        const isWarning = p === WARNING_RETURNING_ON_DELIVERY || p === WARNING_BOOKED_ON_RETURN;
        return (
          <div
            key={i}
            style={{
              fontSize: 11,
              color: isWarning ? "#E65100" : "var(--text-muted)",
              marginTop: 4,
              fontStyle: isWarning ? "normal" : "italic",
            }}
          >
            {isWarning ? (
              <><i className="fa-solid fa-triangle-exclamation" /> {p}</>
            ) : (
              <><i className="fa-solid fa-note-sticky" style={{ marginRight: 4 }} />{p}</>
            )}
          </div>
        );
      })}
    </>
  );
}
import ZoomableImage from "@/components/ZoomableImage";
import PhotoCaptureButton from "@/components/PhotoCaptureButton";
import CameraCaptureModal from "@/components/CameraCaptureModal";
import DressNameSuggestInput from "@/components/DressNameSuggestInput";
import { catalogPhotoUrl } from "@/lib/catalogPhotoUrl";
import { photoUrl } from "@/lib/photoUrl";
import { fetchJson } from "@/lib/fetchJson";
import { useToast } from "@/components/ui/Toast";
import type { BookingForStandardDetails } from "@/lib/bookingDetails";
import {
  JEWELLERY_PART_DEFS,
  formatJewelleryPartsLabel,
  itemHasJewelleryParts,
  picksFromKeys,
  type JewelleryPartKey,
} from "@/lib/jewelleryParts";

type Selection = {
  id: number;
  itemId: number | null;
  name: string;
  category: string | null;
  photo: string | null;
  source: string;
  note: string | null;
  pickNecklace?: boolean;
  pickEarrings?: boolean;
  pickTeeka?: boolean;
  pickPasa?: boolean;
  partsLabel?: string;
};

type AvailItem = {
  id: number;
  name: string;
  display_name?: string;
  category: string;
  size?: string | null;
  color?: string | null;
  photo?: string;
  has_necklace?: boolean;
  has_earrings?: boolean;
  has_teeka?: boolean;
  has_pasa?: boolean;
  available_parts?: JewelleryPartKey[];
  booked_parts?: JewelleryPartKey[];
  returning_warning?: BookingWarningRecord | null;
  booked_warning?: BookingWarningRecord | null;
};

type Categories = {
  mens_categories: string[];
  womens_categories: string[];
  jewellery_categories: string[];
  accessory_categories: string[];
};

export default function JewellerySelectionClient({
  bookingId,
  monthlySerial,
  booking,
  initialSelections,
  categories,
}: {
  bookingId: number;
  monthlySerial: number;
  booking: BookingForStandardDetails;
  initialSelections: Selection[];
  categories: Categories;
}) {
  const toast = useToast();
  const router = useRouter();
  const [selections, setSelections] = useState<Selection[]>(initialSelections);

  // Manual add
  const [manualName, setManualName] = useState("");
  const [manualNote, setManualNote] = useState("");
  const [manualPhoto, setManualPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [savingManual, setSavingManual] = useState(false);
  const [cameraForId, setCameraForId] = useState<number | null>(null);
  const [photoBusyId, setPhotoBusyId] = useState<number | null>(null);

  // Inventory add
  const [showInventory, setShowInventory] = useState(false);
  const [availLoading, setAvailLoading] = useState(false);
  const [avail, setAvail] = useState<AvailItem[]>([]);
  const [addingId, setAddingId] = useState<number | null>(null);
  const [category, setCategory] = useState("");
  const [inventoryNote, setInventoryNote] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [partPicks, setPartPicks] = useState<Record<number, Record<JewelleryPartKey, boolean>>>({});

  const selectedItemIds = new Set(selections.filter((s) => s.itemId != null).map((s) => s.itemId as number));

  function defaultPartPicks(item: AvailItem): Record<JewelleryPartKey, boolean> {
    const picks: Record<JewelleryPartKey, boolean> = { necklace: false, earrings: false, teeka: false, pasa: false };
    for (const p of item.available_parts || []) picks[p] = true;
    if (!item.available_parts?.length && itemHasJewelleryParts({
      hasNecklace: item.has_necklace,
      hasEarrings: item.has_earrings,
      hasTeeka: item.has_teeka,
      hasPasa: item.has_pasa,
    })) {
      if (item.has_necklace) picks.necklace = true;
      if (item.has_earrings) picks.earrings = true;
      if (item.has_teeka) picks.teeka = true;
      if (item.has_pasa) picks.pasa = true;
    }
    return picks;
  }

  function getPartPicks(item: AvailItem): Record<JewelleryPartKey, boolean> {
    return partPicks[item.id] ?? defaultPartPicks(item);
  }

  function setPartPick(itemId: number, key: JewelleryPartKey, checked: boolean) {
    setPartPicks((prev) => ({
      ...prev,
      [itemId]: { ...(prev[itemId] || {}), [key]: checked },
    }));
  }

  const loadAvailable = useCallback(async () => {
    setAvailLoading(true);
    try {
      const qs = category ? `?category=${encodeURIComponent(category)}` : "";
      const data = await fetchJson<{ items: AvailItem[] }>(`/api/jewellery-selection/${bookingId}/available${qs}`);
      setAvail(data.items || []);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to load availability", "error");
    } finally {
      setAvailLoading(false);
    }
  }, [bookingId, toast, category]);

  useEffect(() => {
    if (showInventory) {
      setAppliedSearch("");
      setSearchInput("");
      loadAvailable();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInventory, category]);

  async function uploadPhoto(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/uploads/order-photo", { method: "POST", body: form, credentials: "same-origin" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setManualPhoto(data.photo);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Upload failed", "error");
    } finally {
      setUploading(false);
    }
  }

  async function addManual(e: React.FormEvent) {
    e.preventDefault();
    if (!manualName.trim()) {
      toast("Enter the jewellery name", "error");
      return;
    }
    setSavingManual(true);
    try {
      const res = await fetchJson<{ id: number }>(`/api/jewellery-selection/${bookingId}/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: manualName.trim(), photo: manualPhoto, note: manualNote.trim() || null }),
      });
      setSelections((prev) => [
        ...prev,
        { id: res.id, itemId: null, name: manualName.trim(), category: null, photo: manualPhoto, source: "manual", note: manualNote.trim() || null },
      ]);
      setManualName("");
      setManualNote("");
      setManualPhoto(null);
      toast("Jewellery added", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to add", "error");
    } finally {
      setSavingManual(false);
    }
  }

  async function addFromInventory(item: AvailItem) {
    setAddingId(item.id);
    const warning = item.returning_warning
      ? WARNING_RETURNING_ON_DELIVERY
      : item.booked_warning
        ? WARNING_BOOKED_ON_RETURN
        : null;
    const note = buildStoredNote(warning, inventoryNote);

    const picks = getPartPicks(item);
    const pickKeys = (Object.keys(picks) as JewelleryPartKey[]).filter((k) => picks[k]);
    const hasParts = itemHasJewelleryParts({
      hasNecklace: item.has_necklace,
      hasEarrings: item.has_earrings,
      hasTeeka: item.has_teeka,
      hasPasa: item.has_pasa,
    });
    if (hasParts && !pickKeys.length) {
      toast("Select at least one part to book", "error");
      setAddingId(null);
      return;
    }
    const pickFlags = picksFromKeys(pickKeys);

    try {
      const res = await fetchJson<{ id: number }>(`/api/jewellery-selection/${bookingId}/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_id: item.id,
          name: item.display_name || item.name,
          category: item.category,
          note,
          pick_necklace: pickFlags.pickNecklace,
          pick_earrings: pickFlags.pickEarrings,
          pick_teeka: pickFlags.pickTeeka,
          pick_pasa: pickFlags.pickPasa,
        }),
      });
      const partsLabel = formatJewelleryPartsLabel(pickKeys);
      const displayName = partsLabel
        ? `${item.display_name || item.name} (${partsLabel})`
        : (item.display_name || item.name);
      setSelections((prev) => [
        ...prev,
        {
          id: res.id,
          itemId: item.id,
          name: displayName,
          category: item.category,
          photo: item.photo || null,
          source: "inventory",
          note,
          ...pickFlags,
          partsLabel,
        },
      ]);
      toast("Jewellery added from inventory", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to add", "error");
    } finally {
      setAddingId(null);
    }
  }

  async function captureSelectionPhoto(selectionId: number, file: File) {
    setPhotoBusyId(selectionId);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/uploads/order-photo", { method: "POST", body: form, credentials: "same-origin" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      await fetchJson(`/api/jewellery-selection/${bookingId}/photo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selection_id: selectionId, photo: data.photo }),
      });
      setSelections((prev) => prev.map((s) => (s.id === selectionId ? { ...s, photo: data.photo } : s)));
      toast("Photo saved", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to save photo", "error");
    } finally {
      setPhotoBusyId(null);
      setCameraForId(null);
    }
  }

  async function removeSelection(id: number) {
    if (!confirm("Remove this jewellery from the record?")) return;
    try {
      await fetchJson(`/api/jewellery-selection/${bookingId}/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selection_id: id }),
      });
      setSelections((prev) => prev.filter((s) => s.id !== id));
      toast("Removed", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  const filteredAvail = appliedSearch.trim()
    ? avail.filter((i) => {
        const q = appliedSearch.trim().toLowerCase();
        const hay = [i.display_name, i.name, i.category, i.size, i.color].filter(Boolean).join(" ").toLowerCase();
        return hay.includes(q);
      })
    : avail;

  const freeItems = filteredAvail.filter((i) => !i.returning_warning && !i.booked_warning);
  const warnedItems = filteredAvail.filter((i) => i.returning_warning || i.booked_warning);

  function groupByCategory(items: AvailItem[]): Array<[string, AvailItem[]]> {
    const map = new Map<string, AvailItem[]>();
    for (const it of items) {
      const key = it.category || "Other";
      const arr = map.get(key);
      if (arr) arr.push(it);
      else map.set(key, [it]);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }

  function GroupedList({ items }: { items: AvailItem[] }) {
    const groups = groupByCategory(items);
    return (
      <>
        {groups.map(([cat, list]) => (
          <div key={cat} style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, margin: "8px 0 6px" }}>
              {cat} ({list.length})
            </div>
            {list.map((i) => <AvailRow key={i.id} item={i} />)}
          </div>
        ))}
      </>
    );
  }

  function AvailRow({ item }: { item: AvailItem }) {
    const already = selectedItemIds.has(item.id);
    const hasParts = itemHasJewelleryParts({
      hasNecklace: item.has_necklace,
      hasEarrings: item.has_earrings,
      hasTeeka: item.has_teeka,
      hasPasa: item.has_pasa,
    });
    const picks = getPartPicks(item);
    return (
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "flex-start",
          padding: 12,
          border: "1px solid var(--border)",
          borderRadius: 10,
          marginBottom: 10,
        }}
      >
        {item.photo ? (
          <ZoomableImage src={catalogPhotoUrl(item)} alt={item.name} overlayCaption={item.display_name || item.name} style={{ width: 54, height: 54, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
        ) : (
          <div style={{ width: 54, height: 54, borderRadius: 8, background: "var(--cream-dark)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", flexShrink: 0 }}>
            <i className="fa-solid fa-gem" />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>{item.display_name || item.name}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {item.category}
            {item.size ? ` · ${item.size}` : ""}
            {item.color ? ` · ${item.color}` : ""}
          </div>
          {item.returning_warning && <BookingWarningPanel w={item.returning_warning} variant="returning" />}
          {item.booked_warning && <BookingWarningPanel w={item.booked_warning} variant="booked" />}
          {hasParts && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
                Book which parts: <span style={{ fontStyle: "italic" }}>(untick the parts you don&apos;t want — e.g. keep only Earrings)</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {JEWELLERY_PART_DEFS.map((def) => {
                  const present =
                    def.key === "necklace"
                      ? item.has_necklace
                      : def.key === "earrings"
                        ? item.has_earrings
                        : def.key === "teeka"
                          ? item.has_teeka
                          : item.has_pasa;
                  if (!present) return null;
                  const booked = item.booked_parts?.includes(def.key);
                  return (
                    <label key={def.key} style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 12, opacity: booked ? 0.5 : 1 }}>
                      <input
                        type="checkbox"
                        checked={picks[def.key]}
                        disabled={booked}
                        onChange={(e) => setPartPick(item.id, def.key, e.target.checked)}
                      />
                      {def.label}{booked ? " (booked)" : ""}
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <button
          type="button"
          className="btn btn-sm btn-primary"
          disabled={already || addingId === item.id}
          onClick={() => addFromInventory(item)}
          style={{ flexShrink: 0 }}
        >
          {already ? "Added" : addingId === item.id ? "Adding…" : (<><i className="fa-solid fa-plus" /> Add</>)}
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header" style={{ flexWrap: "wrap", gap: 8 }}>
          <h3 className="card-title">Booking #{String(monthlySerial).padStart(2, "0")} — Record</h3>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => router.push("/jewellery-selection")}>
            <i className="fa-solid fa-check" style={{ marginRight: 6 }} /> Save &amp; Back
          </button>
        </div>
        <div className="card-body">
          <BookingRecordDetails booking={booking} />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h3 className="card-title" style={{ color: "#8a6d1a" }}>
            <i className="fa-solid fa-gem" style={{ marginRight: 8 }} />
            Selected Jewellery ({selections.length})
          </h3>
        </div>
        <div className="card-body">
          {selections.length === 0 ? (
            <p style={{ color: "var(--text-muted)" }}>No jewellery selected yet. Add from inventory or manually below.</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
              {selections.map((s) => (
                <div key={s.id} style={{ display: "flex", gap: 12, padding: 12, border: "1px solid var(--border)", borderRadius: 10 }}>
                  {s.photo ? (
                    <ZoomableImage src={photoUrl(s.photo)} alt={s.name} overlayCaption={s.name} style={{ width: 56, height: 56, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 56, height: 56, borderRadius: 8, background: "var(--cream-dark)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", flexShrink: 0 }}>
                      <i className="fa-solid fa-gem" />
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      <span
                        className={s.source === "inventory" ? "badge badge-info" : ""}
                        style={s.source === "inventory" ? { fontSize: 9 } : { fontSize: 9, padding: "2px 8px", borderRadius: 12, background: "var(--cream-dark)", color: "var(--text-muted)" }}
                      >
                        {s.source === "inventory" ? "Inventory" : "Manual"}
                      </span>
                      {s.category ? ` · ${s.category}` : ""}
                      {s.partsLabel ? ` · ${s.partsLabel}` : ""}
                    </div>
                    {s.note && <NoteLines note={s.note} />}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        style={{ fontSize: 10, padding: "3px 8px" }}
                        onClick={() => setCameraForId(s.id)}
                        disabled={photoBusyId === s.id}
                      >
                        <i className="fa-solid fa-camera" style={{ marginRight: 4 }} />
                        {photoBusyId === s.id ? "Saving…" : s.photo ? "Retake Photo" : "Click Photo"}
                      </button>
                      <button type="button" className="btn btn-danger btn-sm" style={{ fontSize: 10, padding: "3px 8px" }} onClick={() => removeSelection(s.id)}>
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <CameraCaptureModal
        open={cameraForId !== null}
        title="Capture Jewellery Photo"
        onClose={() => setCameraForId(null)}
        onCapture={(file) => {
          if (cameraForId !== null) captureSelectionPhoto(cameraForId, file);
        }}
      />

      <div className="two-col" style={{ gap: 16, gridTemplateColumns: "1fr 1fr", alignItems: "start" }}>
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <i className="fa-solid fa-pen" style={{ marginRight: 8 }} />
              Add Manually
            </h3>
          </div>
          <div className="card-body">
            <form onSubmit={addManual}>
              <div className="form-group">
                <label className="form-label">Jewellery Name *</label>
                <DressNameSuggestInput
                  itemType="jewellery"
                  showPhotos
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  onSuggestSelect={(item) => setManualName(item.name)}
                  placeholder="e.g. Kundan Necklace Set"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Note (optional)</label>
                <input
                  className="form-control"
                  value={manualNote}
                  onChange={(e) => setManualNote(e.target.value)}
                  placeholder="e.g. Match with pink lehenga, return with dress"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Photo (live camera)</label>
                <PhotoCaptureButton
                  label="Jewellery photo"
                  modalTitle="Capture Jewellery Photo"
                  savedUrl={manualPhoto ? photoUrl(manualPhoto) : null}
                  onCapture={(file) => uploadPhoto(file)}
                  emptyHeight={120}
                />
                {uploading && <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>Uploading…</p>}
              </div>
              <button type="submit" className="btn btn-primary btn-sm" disabled={savingManual || uploading}>
                <i className="fa-solid fa-plus" /> Add Jewellery
              </button>
            </form>
          </div>
        </div>

        <div className="card">
          <div className="card-header" style={{ flexWrap: "wrap", gap: 8 }}>
            <h3 className="card-title">
              <i className="fa-solid fa-layer-group" style={{ marginRight: 8 }} />
              Add from Inventory
            </h3>
            {showInventory && (
              <button type="button" className="btn btn-outline btn-sm" onClick={loadAvailable} disabled={availLoading}>
                <i className="fa-solid fa-rotate" /> Refresh
              </button>
            )}
          </div>
          <div className="card-body">
            {!showInventory ? (
              <>
                <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 0 }}>
                  Availability is checked against this booking&apos;s delivery and return dates — completely free
                  jewellery is shown first, alternatively-booked items below with a warning.
                </p>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowInventory(true)}>
                  <i className="fa-solid fa-magnifying-glass" /> Check Availability
                </button>
              </>
            ) : (
              <>
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label className="form-label">Category</label>
                  <select
                    className="form-control"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    aria-label="Filter jewellery by category"
                  >
                    <option value="">All Jewellery</option>
                    <optgroup label="Jewellery">
                      {categories.jewellery_categories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Men&apos;s">
                      {categories.mens_categories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Women&apos;s">
                      {categories.womens_categories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Accessories">
                      {categories.accessory_categories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </optgroup>
                  </select>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 8,
                    alignItems: "end",
                    marginBottom: 12,
                  }}
                >
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Search Jewellery</label>
                    <input
                      className="form-control"
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && setAppliedSearch(searchInput)}
                      placeholder="Name, category, colour…"
                    />
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setAppliedSearch(searchInput)}
                    style={{ marginBottom: 0, height: 38 }}
                  >
                    <i className="fa-solid fa-search" /> Search
                  </button>
                </div>
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label className="form-label">Note (optional)</label>
                  <input
                    className="form-control"
                    value={inventoryNote}
                    onChange={(e) => setInventoryNote(e.target.value)}
                    placeholder="Note for the next jewellery you add from inventory"
                  />
                </div>
                {availLoading ? (
                  <p style={{ color: "var(--text-muted)" }}>Checking availability…</p>
                ) : avail.length === 0 ? (
                  <p style={{ color: "var(--text-muted)" }}>No items available for these dates.</p>
                ) : filteredAvail.length === 0 ? (
                  <p style={{ color: "var(--text-muted)" }}>No items match your search.</p>
                ) : (
                  <>
                    {freeItems.length > 0 && (
                      <>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--success)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                          Completely Free ({freeItems.length})
                        </div>
                        <GroupedList items={freeItems} />
                      </>
                    )}
                    {warnedItems.length > 0 && (
                      <>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#E65100", textTransform: "uppercase", letterSpacing: 0.5, margin: "14px 0 8px" }}>
                          Alternatively Booked ({warnedItems.length})
                        </div>
                        <GroupedList items={warnedItems} />
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
        <button type="button" className="btn btn-primary" onClick={() => router.push("/jewellery-selection")}>
          <i className="fa-solid fa-check" style={{ marginRight: 8 }} /> Save &amp; Back
        </button>
      </div>
    </>
  );
}

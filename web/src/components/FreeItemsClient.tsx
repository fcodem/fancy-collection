"use client";

import { useCallback, useEffect, useState } from "react";
import CategorySelect from "./CategorySelect";
import { BookingWarningPanel } from "@/components/BookingDetailsColumns";
import { WARNING_BOOKED_ON_RETURN, WARNING_RETURNING_ON_DELIVERY } from "@/lib/bookingDetails";
import type { BookingWarningRecord } from "@/lib/bookingDetails";
import { BASE_JEWELLERY, BASE_MENS, BASE_WOMENS, SIZES } from "@/lib/constants";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";
import { BOOKING_EVENTS, INVENTORY_EVENTS } from "@/lib/realtime/types";
import DownloadPdfButton from "@/components/DownloadPdfButton";
import ZoomableImage from "@/components/ZoomableImage";
import { catalogPhotoUrl } from "@/lib/catalogPhotoUrl";
import { formatJewelleryPartsLabel, type JewelleryPartKey } from "@/lib/jewelleryParts";

type FreeItem = {
  id: number;
  name: string;
  display_name?: string;
  category: string;
  size?: string;
  color?: string;
  sub_category?: string;
  photo?: string;
  item_type?: string;
  has_necklace?: boolean;
  has_earrings?: boolean;
  has_teeka?: boolean;
  has_pasa?: boolean;
  booked_parts?: JewelleryPartKey[];
  available_parts?: JewelleryPartKey[];
  returning_warning?: BookingWarningRecord | null;
  booked_warning?: BookingWarningRecord | null;
};

function hasBookedParts(item: FreeItem): boolean {
  return (item.booked_parts?.length ?? 0) > 0;
}

const BRIDAL_JEWELLERY = "Bridal Jewellery";

// Four main divisions requested for the Free Item List.
const GROUP_OPTIONS = [
  { value: "", label: "All Divisions" },
  { value: "men", label: "Mens" },
  { value: "women", label: "Woman" },
  { value: "jewellery", label: "Jewellery" },
  { value: "bridal", label: "Bridal Jewellery" },
];

function matchesGroup(cat: string, group: string): boolean {
  if (!group) return true;
  if (group === "men") return BASE_MENS.includes(cat);
  if (group === "women") return BASE_WOMENS.includes(cat);
  if (group === "jewellery") return BASE_JEWELLERY.includes(cat) && cat !== BRIDAL_JEWELLERY;
  if (group === "bridal") return cat === BRIDAL_JEWELLERY;
  return true;
}

// Fixed display order so a whole division shows its categories in a sensible sequence
// (e.g. Men → Sherwani, Indowestern, Jodhpuri … ).
const CATEGORY_ORDER = [...BASE_MENS, ...BASE_WOMENS, ...BASE_JEWELLERY];

function categoryRank(cat: string): number {
  const i = CATEGORY_ORDER.indexOf(cat);
  return i === -1 ? CATEGORY_ORDER.length : i;
}

function sortByCategory(items: FreeItem[]): FreeItem[] {
  return [...items].sort(
    (a, b) =>
      categoryRank(a.category) - categoryRank(b.category) ||
      (a.category || "").localeCompare(b.category || "") ||
      (a.display_name || a.name || "").localeCompare(b.display_name || b.name || ""),
  );
}

function groupByCategory(items: FreeItem[]): { category: string; items: FreeItem[] }[] {
  const groups: { category: string; items: FreeItem[] }[] = [];
  for (const it of sortByCategory(items)) {
    const cat = it.category || "Other";
    const last = groups[groups.length - 1];
    if (last && last.category === cat) last.items.push(it);
    else groups.push({ category: cat, items: [it] });
  }
  return groups;
}

function FreeItemBlock({ item }: { item: FreeItem }) {
  const isJewellery = item.item_type === "jewellery";
  const freeLabel = formatJewelleryPartsLabel(item.available_parts || []);
  const bookedLabel = formatJewelleryPartsLabel(item.booked_parts || []);
  return (
    <div className="free-item-block" style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      {item.photo ? (
        <ZoomableImage
          src={catalogPhotoUrl(item)}
          alt={item.display_name || item.name}
          overlayCaption={item.display_name || item.name}
          style={{ width: 56, height: 56, borderRadius: 8, objectFit: "cover", flexShrink: 0, cursor: "zoom-in" }}
        />
      ) : (
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 8,
            background: "var(--cream-dark)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-muted)",
            flexShrink: 0,
          }}
        >
          <i className={`fa-solid ${isJewellery ? "fa-gem" : "fa-shirt"}`} />
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="free-item-summary">
          <strong>{item.display_name || item.name}</strong>
          <span className="free-item-meta">
            {item.category}
            {item.size ? ` · ${item.size}` : ""}
            {item.color ? ` · ${item.color}` : ""}
          </span>
        </div>
        {isJewellery && freeLabel && (
          <div style={{ fontSize: 11, color: "var(--success)", marginTop: 4 }}>
            <i className="fa-solid fa-circle-check" style={{ marginRight: 4 }} />
            Free parts: {freeLabel}
          </div>
        )}
        {isJewellery && bookedLabel && (
          <div style={{ fontSize: 11, color: "#E65100", marginTop: 4 }}>
            <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 4 }} />
            Booked in another record: {bookedLabel}
          </div>
        )}
        {item.returning_warning && (
          <BookingWarningPanel w={item.returning_warning} variant="returning" />
        )}
        {item.booked_warning && (
          <BookingWarningPanel w={item.booked_warning} variant="booked" />
        )}
      </div>
    </div>
  );
}

function FreeItemsSection({
  title,
  titleColor,
  items,
}: {
  title: string;
  titleColor?: string;
  items: FreeItem[];
}) {
  if (!items.length) return null;
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <h3 className="card-title" style={titleColor ? { color: titleColor } : undefined}>
          {title} ({items.length})
        </h3>
      </div>
      <div className="card-body packing-items-section">
        {groupByCategory(items).map((grp) => (
          <div key={grp.category} style={{ marginBottom: 14 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: 0.5,
                margin: "2px 0 8px",
                borderBottom: "1px solid var(--border)",
                paddingBottom: 4,
              }}
            >
              {grp.category} ({grp.items.length})
            </div>
            {grp.items.map((item) => (
              <FreeItemBlock key={item.id} item={item} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function FreeItemsClient({ today }: { today: string }) {
  const [deliveryDate, setDeliveryDate] = useState(today);
  const [returnDate, setReturnDate] = useState(today);
  const [group, setGroup] = useState("");
  const [category, setCategory] = useState("");
  const [size, setSize] = useState("");
  const [subCat, setSubCat] = useState("");
  const [free, setFree] = useState<FreeItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  const showSize = category === "Sherwani" || category === "Suit" || category === "Blazer";

  const search = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/booking/available-items?delivery_date=${deliveryDate}&return_date=${returnDate}&category=${encodeURIComponent(category)}`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const data = await res.json();
      let items: FreeItem[] = data.free_items || [];
      if (group) items = items.filter((i) => matchesGroup(i.category, group));
      if (size) items = items.filter((i) => i.size === size);
      if (subCat) items = items.filter((i) => (i.sub_category || "Normal") === subCat);
      setFree(items);
      setLoaded(true);
    } catch {
      /* ignore transient network errors (e.g. dev recompile during poll refresh) */
      setLoaded(true);
    }
  }, [deliveryDate, returnDate, group, category, size, subCat]);

  useEffect(() => {
    search();
  }, []);

  // Re-run the search automatically when the division / size / sub-category changes
  // so those filters combine with the selected group instantly.
  useEffect(() => {
    if (loaded) search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, size, subCat]);

  useRealtimeRefresh([...BOOKING_EVENTS, ...INVENTORY_EVENTS], () => {
    if (loaded) search();
  });

  const totallyFree = free.filter((i) => !i.returning_warning && !i.booked_warning && !hasBookedParts(i));
  const partialParts = free.filter((i) => !i.returning_warning && !i.booked_warning && hasBookedParts(i));
  const returning = free.filter((i) => i.returning_warning && !i.booked_warning);
  const booked = free.filter((i) => i.booked_warning && !i.returning_warning);
  const both = free.filter((i) => i.returning_warning && i.booked_warning);

  const pdfHeaders = ["Item", "Category", "Size", "Color", "Availability"];
  const pdfRows = sortByCategory(free).map((item) => {
    let availability = "Totally Free";
    if (item.returning_warning && item.booked_warning) availability = "Returning & Booked";
    else if (item.returning_warning) availability = "Returning on delivery date";
    else if (item.booked_warning) availability = "Booked on return date";
    else if (hasBookedParts(item)) availability = "Some parts free";
    const freeLabel = formatJewelleryPartsLabel(item.available_parts || []);
    const bookedLabel = formatJewelleryPartsLabel(item.booked_parts || []);
    if (item.item_type === "jewellery" && (freeLabel || bookedLabel)) {
      const notes = [freeLabel ? `Free: ${freeLabel}` : "", bookedLabel ? `Booked: ${bookedLabel}` : ""].filter(Boolean).join("; ");
      availability = `${availability}${notes ? ` (${notes})` : ""}`;
    }
    return [
      item.display_name || item.name || "—",
      item.category || "—",
      item.size || "—",
      item.color || "—",
      availability,
    ];
  });

  return (
    <div>
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <h3 className="card-title">Search Free Items</h3>
          <DownloadPdfButton
            title="Free Items"
            filename={`free-items-${deliveryDate}`}
            subtitle={`Pickup: ${deliveryDate} · Return: ${returnDate}${group ? ` · ${GROUP_OPTIONS.find((g) => g.value === group)?.label}` : ""}${category ? ` · ${category}` : ""}`}
            headers={pdfHeaders}
            rows={pdfRows}
            disabled={!loaded || !pdfRows.length}
            size="sm"
          />
        </div>
        <div className="card-body">
          <div className="filter-grid-5">
            <div>
              <label className="form-label">Pickup Date</label>
              <input type="date" className="form-control" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
            </div>
            <div>
              <label className="form-label">Return Date</label>
              <input type="date" className="form-control" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
            </div>
            <div>
              <label className="form-label">Category Group</label>
              <select className="form-control" value={group} onChange={(e) => setGroup(e.target.value)}>
                {GROUP_OPTIONS.map((g) => (
                  <option key={g.value} value={g.value}>{g.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">Category</label>
              <CategorySelect value={category} onChange={setCategory} />
            </div>
            {showSize && (
              <div>
                <label className="form-label">Size</label>
                <select className="form-control" value={size} onChange={(e) => setSize(e.target.value)}>
                  <option value="">All Sizes</option>
                  {SIZES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="form-label">Sub-Category</label>
              <select className="form-control" value={subCat} onChange={(e) => setSubCat(e.target.value)}>
                <option value="">All</option>
                <option value="Premium">Premium</option>
                <option value="Normal">Normal</option>
                <option value="Cheap">Cheap</option>
              </select>
            </div>
          </div>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={search}>
            Search
          </button>
        </div>
      </div>

      {loaded && (
        <>
          <FreeItemsSection title="Totally Free" titleColor="var(--success)" items={totallyFree} />
          <FreeItemsSection title="Some Parts Booked (parts still free)" titleColor="#E65100" items={partialParts} />
          <FreeItemsSection title={WARNING_RETURNING_ON_DELIVERY} titleColor="#E65100" items={returning} />
          <FreeItemsSection title={WARNING_BOOKED_ON_RETURN} titleColor="var(--danger)" items={booked} />
          <FreeItemsSection title={`${WARNING_RETURNING_ON_DELIVERY} & ${WARNING_BOOKED_ON_RETURN}`} items={both} />
        </>
      )}

      {loaded && !free.length && (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
          No free items found for selected dates.
        </div>
      )}
    </div>
  );
}

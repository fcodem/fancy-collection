"use client";

import { useCallback, useEffect, useState } from "react";
import CategorySelect from "./CategorySelect";
import { BookingWarningPanel } from "@/components/BookingDetailsColumns";
import { WARNING_BOOKED_ON_RETURN, WARNING_RETURNING_ON_DELIVERY } from "@/lib/bookingDetails";
import type { BookingWarningRecord } from "@/lib/bookingDetails";
import { SIZES } from "@/lib/constants";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";
import { BOOKING_EVENTS, INVENTORY_EVENTS } from "@/lib/realtime/types";
import DownloadPdfButton from "@/components/DownloadPdfButton";

type FreeItem = {
  id: number;
  name: string;
  display_name?: string;
  category: string;
  size?: string;
  color?: string;
  sub_category?: string;
  returning_warning?: BookingWarningRecord | null;
  booked_warning?: BookingWarningRecord | null;
};

function FreeItemBlock({ item }: { item: FreeItem }) {
  return (
    <div className="free-item-block">
      <div className="free-item-summary">
        <strong>{item.display_name || item.name}</strong>
        <span className="free-item-meta">
          {item.category}
          {item.size ? ` · ${item.size}` : ""}
          {item.color ? ` · ${item.color}` : ""}
        </span>
      </div>
      {item.returning_warning && (
        <BookingWarningPanel w={item.returning_warning} variant="returning" />
      )}
      {item.booked_warning && (
        <BookingWarningPanel w={item.booked_warning} variant="booked" />
      )}
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
        {items.map((item) => (
          <FreeItemBlock key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

export default function FreeItemsClient({ today }: { today: string }) {
  const [deliveryDate, setDeliveryDate] = useState(today);
  const [returnDate, setReturnDate] = useState(today);
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
      );
      if (!res.ok) return;
      const data = await res.json();
      let items: FreeItem[] = data.free_items || [];
      if (size) items = items.filter((i) => i.size === size);
      if (subCat) items = items.filter((i) => i.sub_category === subCat || subCat === "Normal");
      setFree(items);
      setLoaded(true);
    } catch {
      /* ignore transient network errors (e.g. dev recompile during poll refresh) */
      setLoaded(true);
    }
  }, [deliveryDate, returnDate, category, size, subCat]);

  useEffect(() => {
    search();
  }, []);

  useRealtimeRefresh([...BOOKING_EVENTS, ...INVENTORY_EVENTS], () => {
    if (loaded) search();
  });

  const totallyFree = free.filter((i) => !i.returning_warning && !i.booked_warning);
  const returning = free.filter((i) => i.returning_warning && !i.booked_warning);
  const booked = free.filter((i) => i.booked_warning && !i.returning_warning);
  const both = free.filter((i) => i.returning_warning && i.booked_warning);

  const pdfHeaders = ["Dress", "Category", "Size", "Color", "Availability"];
  const pdfRows = free.map((item) => {
    let availability = "Totally Free";
    if (item.returning_warning && item.booked_warning) availability = "Returning & Booked";
    else if (item.returning_warning) availability = "Returning on delivery date";
    else if (item.booked_warning) availability = "Booked on return date";
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
            subtitle={`Pickup: ${deliveryDate} · Return: ${returnDate}${category ? ` · ${category}` : ""}`}
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

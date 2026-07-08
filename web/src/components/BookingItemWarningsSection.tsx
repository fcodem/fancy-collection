import { BookingWarningPanel } from "@/components/BookingDetailsColumns";
import type { ItemWarningSource } from "@/lib/bookingWarningPdf";

export function findItemWarnings(
  items: ItemWarningSource[],
  opts: { itemId?: number | null; dressName?: string },
): ItemWarningSource | undefined {
  let hit: ItemWarningSource | undefined;
  if (opts.itemId) {
    hit = items.find((w) => w.item_id === opts.itemId);
  }
  if (!hit) {
    const name = (opts.dressName || "").trim().toLowerCase();
    if (name) {
      hit = items.find((w) => {
        const dn = (w.dress_name || "").trim().toLowerCase();
        const display = (w.display_name || "").trim().toLowerCase();
        return dn === name || display === name || display.startsWith(name) || name.startsWith(dn);
      });
    }
  }
  if (!hit || (!hit.returning_warning && !hit.booked_warning)) return undefined;
  return hit;
}

export function itemHasWarnings(item: ItemWarningSource | undefined | null) {
  return Boolean(item?.returning_warning || item?.booked_warning);
}

export default function BookingItemWarningsBlock({
  item,
  showDressLabel = false,
}: {
  item: ItemWarningSource;
  showDressLabel?: boolean;
}) {
  if (!item.returning_warning && !item.booked_warning) return null;

  return (
    <div style={{ marginTop: showDressLabel ? 10 : 0 }}>
      {showDressLabel && (item.display_name || item.dress_name) && (
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: "var(--primary)" }}>
          {item.display_name || item.dress_name}
        </div>
      )}
      {item.returning_warning && (
        <div style={{ marginBottom: item.booked_warning ? 10 : 0 }}>
          <BookingWarningPanel w={item.returning_warning} variant="returning" />
        </div>
      )}
      {item.booked_warning && (
        <BookingWarningPanel w={item.booked_warning} variant="booked" />
      )}
    </div>
  );
}

export function BookingItemWarningsSection({
  items,
  title = "Alternate booking warnings",
}: {
  items: ItemWarningSource[];
  title?: string;
}) {
  const withWarnings = items.filter((w) => w.returning_warning || w.booked_warning);
  if (!withWarnings.length) return null;

  // Label each dress when the booking has multiple items, even if only one dress has a warning.
  const showDressLabels = items.length > 1 || withWarnings.length > 1;

  return (
    <div
      className="booking-warnings-section"
      style={{
        marginTop: 20,
        paddingTop: 16,
        borderTop: "1px solid var(--border)",
      }}
    >
      <h4 style={{ marginBottom: 12, fontSize: 15, color: "var(--primary)" }}>
        <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 8, color: "#E65100" }} />
        {title}
      </h4>
      <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>
        Inform the client about timely return — another booking uses the same dress on the delivery or return date.
      </p>
      {withWarnings.map((item, idx) => (
        <div key={`${item.item_id ?? item.dress_name ?? idx}`} style={{ marginBottom: idx < withWarnings.length - 1 ? 14 : 0 }}>
          <BookingItemWarningsBlock item={item} showDressLabel={showDressLabels} />
        </div>
      ))}
    </div>
  );
}

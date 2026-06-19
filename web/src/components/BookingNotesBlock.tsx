import type { CSSProperties } from "react";
import type { StandardBookingDetails } from "@/lib/bookingDetails";
import { serializeStandardBookingDetails } from "@/lib/bookingDetails";

type NotesSource = {
  item_notes?: string;
  common_notes?: string;
  itemNotes?: string;
  commonNotes?: string;
};

export function pickNotes(source: NotesSource) {
  return {
    itemNotes: source.item_notes ?? source.itemNotes ?? "",
    commonNotes: source.common_notes ?? source.commonNotes ?? "",
  };
}

/** Per-dress + common booking notes — use on every list/detail row. */
export function BookingNotesBlock({
  itemNotes,
  commonNotes,
  style,
  compact = false,
}: {
  itemNotes?: string | null;
  commonNotes?: string | null;
  style?: CSSProperties;
  compact?: boolean;
}) {
  const dress = itemNotes?.trim() || "";
  const common = commonNotes?.trim() || "";
  if (!dress && !common) return null;

  const fontSize = compact ? 10 : 11;

  return (
    <div className="booking-notes-block" style={{ marginTop: compact ? 3 : 6, fontSize, ...style }}>
      {dress && (
        <div
          style={{
            fontStyle: "italic",
            color: "var(--primary)",
            wordBreak: "break-word",
            lineHeight: 1.35,
          }}
        >
          <i className="fa-solid fa-shirt" style={{ marginRight: 5, opacity: 0.85 }} aria-hidden />
          <strong>Dress note:</strong> {dress}
        </div>
      )}
      {common && (
        <div
          style={{
            color: "var(--text-muted)",
            wordBreak: "break-word",
            lineHeight: 1.35,
            marginTop: dress ? 3 : 0,
          }}
        >
          <i className="fa-solid fa-clipboard" style={{ marginRight: 5, opacity: 0.85 }} aria-hidden />
          <strong>Common note:</strong> {common}
        </div>
      )}
    </div>
  );
}

export function BookingNotesFromBooking({
  booking,
  style,
  compact = false,
}: {
  booking: Parameters<typeof serializeStandardBookingDetails>[0];
  style?: CSSProperties;
  compact?: boolean;
}) {
  const d = serializeStandardBookingDetails(booking);
  const { itemNotes, commonNotes } = pickNotes(d);
  return <BookingNotesBlock itemNotes={itemNotes} commonNotes={commonNotes} style={style} compact={compact} />;
}

export function BookingNotesFromStandard({
  details,
  style,
  compact = false,
}: {
  details: StandardBookingDetails;
  style?: CSSProperties;
  compact?: boolean;
}) {
  const { itemNotes, commonNotes } = pickNotes(details);
  return <BookingNotesBlock itemNotes={itemNotes} commonNotes={commonNotes} style={style} compact={compact} />;
}

"use client";

import type { ReactNode } from "react";
import ZoomableImage from "@/components/ZoomableImage";
import { privateMediaUrl } from "@/lib/photoUrl";

type CustomerIdPhotosDisplayProps = {
  idPhoto1?: string | null;
  idPhoto2?: string | null;
  variant?: "card" | "inline";
  /** Thumbnail width in px (defaults: card 160, inline 140). */
  width?: number;
  /** Thumbnail height in px (defaults: card 120, inline 100). */
  height?: number;
  /** Booking-wide note entered at delivery (shown beside ID photos on return). */
  commonDeliveryNote?: string | null;
  /** Per-dress delivery notes (shown beside ID photos on return). */
  dressDeliveryNotes?: Array<{ dressName: string; note: string }>;
};

const deliveryNoteHighlightStyle = {
  padding: "14px 16px",
  borderRadius: 10,
  border: "2px solid #d97706",
  background: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)",
  boxShadow: "0 2px 10px rgba(217, 119, 6, 0.18)",
} as const;

function DeliveryNoteHighlight({
  label,
  icon,
  children,
}: {
  label: string;
  icon: string;
  children: ReactNode;
}) {
  return (
    <div style={deliveryNoteHighlightStyle}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: "#92400e",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          marginBottom: 8,
        }}
      >
        <i className={icon} style={{ marginRight: 6 }} aria-hidden />
        {label}
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "#78350f",
          lineHeight: 1.5,
          wordBreak: "break-word",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function DeliveryNotesAside({
  commonDeliveryNote,
  dressDeliveryNotes,
}: {
  commonDeliveryNote?: string | null;
  dressDeliveryNotes?: Array<{ dressName: string; note: string }>;
}) {
  const common = commonDeliveryNote?.trim() || "";
  const dressNotes = (dressDeliveryNotes || []).filter((row) => row.note.trim());
  if (!common && !dressNotes.length) return null;

  return (
    <div style={{ flex: 1, minWidth: 220, display: "grid", gap: 12 }}>
      {common && (
        <DeliveryNoteHighlight label="Common Delivery Note" icon="fa-solid fa-clipboard">
          {common}
        </DeliveryNoteHighlight>
      )}
      {dressNotes.map((row) => (
        <DeliveryNoteHighlight
          key={`${row.dressName}-${row.note}`}
          label={dressNotes.length > 1 ? `Delivery Note — ${row.dressName}` : "Delivery Note"}
          icon="fa-solid fa-truck-fast"
        >
          {row.note}
        </DeliveryNoteHighlight>
      ))}
    </div>
  );
}

function IdPhotoThumbs({
  idPhoto1,
  idPhoto2,
  width,
  height,
}: {
  idPhoto1?: string | null;
  idPhoto2?: string | null;
  width: number;
  height: number;
}) {
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      {idPhoto1 && (
        <ZoomableImage
          src={privateMediaUrl(idPhoto1)}
          alt="Customer ID 1"
          overlayCaption="Customer ID 1"
          style={{
            width,
            height,
            objectFit: "cover",
            borderRadius: 8,
            border: "1px solid var(--border)",
          }}
        />
      )}
      {idPhoto2 && (
        <ZoomableImage
          src={privateMediaUrl(idPhoto2)}
          alt="Customer ID 2"
          overlayCaption="Customer ID 2"
          style={{
            width,
            height,
            objectFit: "cover",
            borderRadius: 8,
            border: "1px solid var(--border)",
          }}
        />
      )}
    </div>
  );
}

/** Display-only customer ID photo thumbs (card with empty state, or compact inline). */
export default function CustomerIdPhotosDisplay({
  idPhoto1,
  idPhoto2,
  variant = "card",
  width,
  height,
  commonDeliveryNote,
  dressDeliveryNotes,
}: CustomerIdPhotosDisplayProps) {
  const hasPhotos = Boolean(idPhoto1 || idPhoto2);
  const thumbW = width ?? (variant === "card" ? 160 : 140);
  const thumbH = height ?? (variant === "card" ? 120 : 100);
  const notesAside = (
    <DeliveryNotesAside
      commonDeliveryNote={commonDeliveryNote}
      dressDeliveryNotes={dressDeliveryNotes}
    />
  );
  const hasNotesAside = Boolean(
    commonDeliveryNote?.trim() || dressDeliveryNotes?.some((row) => row.note.trim()),
  );

  if (variant === "inline") {
    if (!hasPhotos && !hasNotesAside) return null;
    return (
      <div
        style={{
          marginTop: 12,
          padding: "12px 14px",
          border: "1px solid var(--border)",
          borderRadius: 8,
          background: "rgba(90,20,51,0.04)",
        }}
      >
        <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, marginBottom: 10 }}>
          <i className="fa-solid fa-id-card" style={{ marginRight: 6 }} />
          CUSTOMER ID PHOTOS
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
          {hasPhotos && (
            <IdPhotoThumbs idPhoto1={idPhoto1} idPhoto2={idPhoto2} width={thumbW} height={thumbH} />
          )}
          {notesAside}
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div className="card-header">
        <h3 className="card-title">
          <i className="fa-solid fa-id-card" style={{ marginRight: 8 }} />
          Customer ID Photos
        </h3>
      </div>
      <div className="card-body">
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ flexShrink: 0 }}>
            {hasPhotos ? (
              <IdPhotoThumbs idPhoto1={idPhoto1} idPhoto2={idPhoto2} width={thumbW} height={thumbH} />
            ) : (
              <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)", maxWidth: 360 }}>
                No ID photos on file for this booking. Capture them on the delivery page (they upload
                automatically when you take the photo).
              </p>
            )}
          </div>
          {notesAside}
        </div>
      </div>
    </div>
  );
}

"use client";

import { privateMediaUrl } from "@/lib/photoUrl";

type CustomerIdPhotosDisplayProps = {
  idPhoto1?: string | null;
  idPhoto2?: string | null;
  variant?: "card" | "inline";
  /** Thumbnail width in px (defaults: card 160, inline 140). */
  width?: number;
  /** Thumbnail height in px (defaults: card 120, inline 100). */
  height?: number;
};

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
        <a href={privateMediaUrl(idPhoto1)} target="_blank" rel="noreferrer">
          <img
            src={privateMediaUrl(idPhoto1)}
            alt="Customer ID 1"
            style={{
              width,
              height,
              objectFit: "cover",
              borderRadius: 8,
              border: "1px solid var(--border)",
            }}
          />
        </a>
      )}
      {idPhoto2 && (
        <a href={privateMediaUrl(idPhoto2)} target="_blank" rel="noreferrer">
          <img
            src={privateMediaUrl(idPhoto2)}
            alt="Customer ID 2"
            style={{
              width,
              height,
              objectFit: "cover",
              borderRadius: 8,
              border: "1px solid var(--border)",
            }}
          />
        </a>
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
}: CustomerIdPhotosDisplayProps) {
  const hasPhotos = Boolean(idPhoto1 || idPhoto2);
  const thumbW = width ?? (variant === "card" ? 160 : 140);
  const thumbH = height ?? (variant === "card" ? 120 : 100);

  if (variant === "inline") {
    if (!hasPhotos) return null;
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
        <IdPhotoThumbs idPhoto1={idPhoto1} idPhoto2={idPhoto2} width={thumbW} height={thumbH} />
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
        {hasPhotos ? (
          <IdPhotoThumbs idPhoto1={idPhoto1} idPhoto2={idPhoto2} width={thumbW} height={thumbH} />
        ) : (
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
            No ID photos on file for this booking. Capture them on the delivery page (they upload
            automatically when you take the photo).
          </p>
        )}
      </div>
    </div>
  );
}

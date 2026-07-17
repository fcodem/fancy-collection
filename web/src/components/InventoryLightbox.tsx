"use client";

import { useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

/**
 * Single shared lightbox — dynamically imported only after first thumb click.
 */
export default function InventoryLightbox({
  src,
  caption,
  onClose,
}: {
  src: string;
  caption?: string;
  onClose: () => void;
}) {
  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onKey]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="inv-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={caption || "Inventory photo"}
      onClick={onClose}
    >
      <button type="button" className="inv-lightbox-close" onClick={onClose} aria-label="Close">
        ×
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={caption || ""}
        className="inv-lightbox-img"
        onClick={(e) => e.stopPropagation()}
      />
      {caption ? <p className="inv-lightbox-caption">{caption}</p> : null}
    </div>,
    document.body,
  );
}

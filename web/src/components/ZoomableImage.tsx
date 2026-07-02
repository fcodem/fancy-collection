"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

/**
 * Thumbnail image that opens a full-screen, click-to-close lightbox when tapped.
 * The overlay is rendered via a portal to `document.body` so it is never clipped
 * by parent containers that use `overflow: hidden` (tables, slip cards, etc.).
 */
export default function ZoomableImage({
  src,
  alt = "",
  style,
  className,
  overlayCaption,
}: {
  src: string;
  alt?: string;
  style?: CSSProperties;
  className?: string;
  overlayCaption?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        style={{ cursor: "zoom-in", ...style }}
        className={className}
        title="Click to enlarge"
      />
      {open && mounted
        ? createPortal(
            <div
              className="no-print"
              onClick={() => setOpen(false)}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 100000,
                background: "rgba(0,0,0,0.85)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: 24,
                cursor: "zoom-out",
              }}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                }}
                aria-label="Close"
                style={{
                  position: "absolute",
                  top: 20,
                  right: 24,
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  border: "none",
                  background: "rgba(255,255,255,0.15)",
                  color: "#fff",
                  fontSize: 22,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <i className="fa-solid fa-xmark" />
              </button>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={alt}
                onClick={(e) => e.stopPropagation()}
                style={{
                  maxWidth: "95vw",
                  maxHeight: overlayCaption ? "82vh" : "90vh",
                  objectFit: "contain",
                  borderRadius: 8,
                  boxShadow: "0 12px 48px rgba(0,0,0,0.6)",
                  cursor: "default",
                }}
              />
              {overlayCaption ? (
                <div style={{ marginTop: 16, color: "#fff", fontSize: 15, maxWidth: "90vw", textAlign: "center" }}>
                  {overlayCaption}
                </div>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

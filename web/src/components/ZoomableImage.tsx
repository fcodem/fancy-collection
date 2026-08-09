"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

const ZOOM_MIN = 1;
const ZOOM_MAX = 5;
const ZOOM_STEP = 0.25;

/**
 * Thumbnail that opens a true full-screen lightbox.
 * Pass `fullSrc` (catalog / original photo) so phone/tablet zoom stays sharp —
 * never enlarge a 180px list thumbnail in the lightbox.
 */
export default function ZoomableImage({
  src,
  fullSrc,
  alt = "",
  style,
  className,
  overlayCaption,
  onError,
  loading,
  decoding,
  width,
  height,
}: {
  src: string;
  /** Full-resolution (or catalog) URL for the lightbox. Falls back to `src`. */
  fullSrc?: string | null;
  alt?: string;
  style?: CSSProperties;
  className?: string;
  overlayCaption?: string;
  onError?: () => void;
  loading?: "eager" | "lazy";
  decoding?: "async" | "auto" | "sync";
  width?: number | string;
  height?: number | string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState("");
  const [displaySrc, setDisplaySrc] = useState(src || "");
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(
    null,
  );

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    setDisplaySrc(src || "");
  }, [src]);

  const resetZoom = useCallback(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    resetZoom();
    if (typeof document !== "undefined" && document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => undefined);
    }
  }, [resetZoom]);

  const zoomIn = useCallback(() => {
    setScale((s) => Math.min(ZOOM_MAX, Math.round((s + ZOOM_STEP) * 100) / 100));
  }, []);

  const zoomOut = useCallback(() => {
    setScale((s) => {
      const next = Math.max(ZOOM_MIN, Math.round((s - ZOOM_STEP) * 100) / 100);
      if (next <= 1) setPan({ x: 0, y: 0 });
      return next;
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "+" || e.key === "=") zoomIn();
      else if (e.key === "-") zoomOut();
      else if (e.key === "0") resetZoom();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const el = overlayRef.current;
    if (el && typeof el.requestFullscreen === "function") {
      void el.requestFullscreen().catch(() => undefined);
    }

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, close, zoomIn, zoomOut, resetZoom]);

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.deltaY < 0) zoomIn();
    else zoomOut();
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (scale <= 1) return;
    e.stopPropagation();
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (!d || !isDragging) return;
    setPan({
      x: d.panX + (e.clientX - d.startX),
      y: d.panY + (e.clientY - d.startY),
    });
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    setIsDragging(false);
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  function onImageDoubleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (scale > 1) resetZoom();
    else setScale(2);
  }

  if (!src) return null;

  const zoomPercent = Math.round(scale * 100);
  const openLightbox = () => {
    const sharp = (fullSrc && String(fullSrc).trim()) || displaySrc || src;
    setLightboxSrc(sharp);
    resetZoom();
    setOpen(true);
  };

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={displaySrc}
        alt={alt}
        width={width}
        height={height}
        loading={loading}
        decoding={decoding}
        onError={() => {
          const fallback = String(fullSrc || "").trim();
          if (fallback && fallback !== displaySrc) {
            setDisplaySrc(fallback);
            return;
          }
          onError?.();
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          openLightbox();
        }}
        style={{ cursor: "zoom-in", ...style }}
        className={className}
        title="Click to enlarge full screen"
      />
      {open && mounted
        ? createPortal(
            <div
              ref={overlayRef}
              className="no-print"
              onClick={close}
              style={{
                position: "fixed",
                inset: 0,
                width: "100vw",
                height: "100vh",
                zIndex: 2147483000,
                background: "#000",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                margin: 0,
                padding: 0,
                cursor: scale > 1 ? "grab" : "zoom-out",
              }}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  close();
                }}
                aria-label="Close"
                style={{
                  position: "absolute",
                  top: "max(12px, env(safe-area-inset-top))",
                  right: "max(12px, env(safe-area-inset-right))",
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  border: "none",
                  background: "rgba(255,255,255,0.18)",
                  color: "#fff",
                  fontSize: 22,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 3,
                }}
              >
                <i className="fa-solid fa-xmark" />
              </button>

              <div
                role="toolbar"
                aria-label="Image zoom"
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: "absolute",
                  top: "max(12px, env(safe-area-inset-top))",
                  left: "50%",
                  transform: "translateX(-50%)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 10px",
                  borderRadius: 999,
                  background: "rgba(0,0,0,0.55)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  zIndex: 3,
                }}
              >
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={zoomOut}
                  disabled={scale <= ZOOM_MIN}
                  aria-label="Zoom out"
                  style={{
                    minWidth: 36,
                    padding: "4px 10px",
                    background: "rgba(255,255,255,0.12)",
                    color: "#fff",
                    border: "none",
                  }}
                >
                  <i className="fa-solid fa-minus" />
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={resetZoom}
                  aria-label="Reset zoom"
                  style={{
                    minWidth: 52,
                    padding: "4px 10px",
                    background: "rgba(255,255,255,0.12)",
                    color: "#fff",
                    border: "none",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {zoomPercent}%
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={zoomIn}
                  disabled={scale >= ZOOM_MAX}
                  aria-label="Zoom in"
                  style={{
                    minWidth: 36,
                    padding: "4px 10px",
                    background: "rgba(255,255,255,0.12)",
                    color: "#fff",
                    border: "none",
                  }}
                >
                  <i className="fa-solid fa-plus" />
                </button>
              </div>

              <div
                onClick={(e) => e.stopPropagation()}
                onWheel={onWheel}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onDoubleClick={onImageDoubleClick}
                style={{
                  flex: 1,
                  width: "100vw",
                  height: "100vh",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  touchAction: "none",
                  cursor: scale > 1 ? (isDragging ? "grabbing" : "grab") : "zoom-in",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={lightboxSrc || fullSrc || src}
                  alt={alt}
                  draggable={false}
                  decoding="sync"
                  loading="eager"
                  style={{
                    width: "100vw",
                    height: overlayCaption ? "calc(100vh - 56px)" : "100vh",
                    maxWidth: "100vw",
                    maxHeight: overlayCaption ? "calc(100vh - 56px)" : "100vh",
                    objectFit: "contain",
                    imageRendering: "auto",
                    WebkitUserSelect: "none",
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                    transformOrigin: "center center",
                    transition: isDragging ? "none" : "transform 0.15s ease",
                    userSelect: "none",
                  }}
                />
              </div>

              {overlayCaption ? (
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: "absolute",
                    bottom: "max(48px, env(safe-area-inset-bottom))",
                    left: 0,
                    right: 0,
                    color: "#fff",
                    fontSize: 15,
                    textAlign: "center",
                    padding: "0 16px",
                    zIndex: 3,
                  }}
                >
                  {overlayCaption}
                </div>
              ) : null}

              <div
                style={{
                  position: "absolute",
                  bottom: "max(12px, env(safe-area-inset-bottom))",
                  left: 0,
                  right: 0,
                  color: "rgba(255,255,255,0.55)",
                  fontSize: 12,
                  textAlign: "center",
                  pointerEvents: "none",
                  zIndex: 2,
                }}
              >
                Full screen · Scroll or +/− to zoom · Double-click · Esc to close
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

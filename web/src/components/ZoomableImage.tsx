"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;

/**
 * Thumbnail image that opens a full-screen lightbox with zoom (+/−, wheel, double-click).
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
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);

  useEffect(() => setMounted(true), []);

  const resetZoom = useCallback(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    resetZoom();
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

  const zoomPercent = Math.round(scale * 100);

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onClick={(e) => {
          e.stopPropagation();
          resetZoom();
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
              onClick={close}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 100000,
                background: "rgba(0,0,0,0.88)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: 24,
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
                  zIndex: 2,
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
                  top: 20,
                  left: "50%",
                  transform: "translateX(-50%)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 10px",
                  borderRadius: 999,
                  background: "rgba(0,0,0,0.45)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  zIndex: 2,
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
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  maxWidth: "95vw",
                  maxHeight: overlayCaption ? "78vh" : "85vh",
                  overflow: "hidden",
                  touchAction: "none",
                  cursor: scale > 1 ? (isDragging ? "grabbing" : "grab") : "zoom-in",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={alt}
                  draggable={false}
                  style={{
                    maxWidth: "95vw",
                    maxHeight: overlayCaption ? "78vh" : "85vh",
                    objectFit: "contain",
                    borderRadius: 8,
                    boxShadow: "0 12px 48px rgba(0,0,0,0.6)",
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
                  style={{ marginTop: 16, color: "#fff", fontSize: 15, maxWidth: "90vw", textAlign: "center" }}
                >
                  {overlayCaption}
                </div>
              ) : null}

              <div
                style={{
                  position: "absolute",
                  bottom: 20,
                  color: "rgba(255,255,255,0.55)",
                  fontSize: 12,
                  textAlign: "center",
                  pointerEvents: "none",
                }}
              >
                Scroll or use +/− to zoom · Double-click to toggle · Drag when zoomed · Esc to close
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

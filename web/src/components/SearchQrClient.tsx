"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMounted } from "@/lib/useMounted";
import {
  bookingQrNavigatePath,
  isAbortError,
  parseQrScanPayload,
} from "@/lib/bookingQrClient";
import {
  cameraErrorMessage,
  cameraFacingLabel,
  cameraHint,
  isMobileOrTablet,
  otherCameraFacing,
  QrCameraSession,
  type ScannerStatus,
} from "@/lib/cameraScanner";

type PermissionUi = "idle" | "requesting" | "granted" | "denied";

export default function SearchQrClient() {
  const router = useRouter();
  const [manualToken, setManualToken] = useState("");
  const [error, setError] = useState("");
  const [permissionUi, setPermissionUi] = useState<PermissionUi>("idle");
  const [cameraReady, setCameraReady] = useState(false);
  const [status, setStatus] = useState<ScannerStatus | null>(null);
  const mounted = useMounted();
  const [isMobile, setIsMobile] = useState(false);

  const sessionRef = useRef<QrCameraSession | null>(null);
  const handledRef = useRef(false);
  const startGenRef = useRef(0);
  const mountedRef = useRef(true);
  const decodeHandlerRef = useRef<(text: string) => void>(() => undefined);

  const goToToken = useCallback(
    async (raw: string) => {
      if (handledRef.current) return;
      const parsed = parseQrScanPayload(raw);
      if (!parsed) {
        setError("Invalid QR code.");
        return;
      }
      if (!parsed.sig) {
        setError("This QR is not a valid Fancy Collection bill code. Only signed bill QRs work here.");
        return;
      }

      handledRef.current = true;
      setError("");
      startGenRef.current += 1;
      await sessionRef.current?.stop();
      sessionRef.current = null;
      setCameraReady(false);
      router.push(bookingQrNavigatePath(parsed));
    },
    [router]
  );

  decodeHandlerRef.current = (text: string) => {
    void goToToken(text);
  };

  const allowCameraAndScan = useCallback(async () => {
    const gen = ++startGenRef.current;
    setError("");
    setPermissionUi("requesting");
    setCameraReady(false);
    setStatus(null);

    await sessionRef.current?.stop();
    sessionRef.current = null;

    const secureContext = typeof window !== "undefined" && window.isSecureContext;

    try {
      if (typeof window !== "undefined" && !secureContext) {
        throw new Error(cameraErrorMessage(new Error("insecure"), false));
      }

      const session = new QrCameraSession("qr-camera-reader");
      sessionRef.current = session;

      const result = await session.start((decoded) => decodeHandlerRef.current(decoded));

      if (!mountedRef.current || gen !== startGenRef.current) {
        await session.stop();
        return;
      }

      setStatus(result);
      setPermissionUi("granted");
      setCameraReady(true);
    } catch (e) {
      if (!mountedRef.current || gen !== startGenRef.current) return;
      await sessionRef.current?.stop();
      sessionRef.current = null;
      setCameraReady(false);

      console.error("[QR Scanner] start failed", e);
      const denied = isNotAllowedError(e);
      setPermissionUi(denied ? "denied" : "idle");
      setError(cameraErrorMessage(e, secureContext));
    }
  }, []);

  const switchCamera = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || !cameraReady) return;

    setError("");
    setPermissionUi("requesting");
    try {
      const result = await session.switchCamera((decoded) => decodeHandlerRef.current(decoded));
      setStatus(result);
      setPermissionUi("granted");
    } catch (e) {
      if (isAbortError(e)) return;
      console.error("[QR Scanner] switch failed", e);
      setError(cameraErrorMessage(e, window.isSecureContext));
      setPermissionUi("granted");
    }
  }, [cameraReady]);

  const stopCamera = useCallback(async () => {
    startGenRef.current += 1;
    await sessionRef.current?.stop();
    sessionRef.current = null;
    setCameraReady(false);
    setStatus(null);
    setPermissionUi("idle");
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      startGenRef.current += 1;
      void sessionRef.current?.stop();
      sessionRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mounted) return;
    setIsMobile(isMobileOrTablet());
    // Auto-open camera: back camera on mobile/tablet, front on desktop
    void allowCameraAndScan();
  }, [mounted]); // eslint-disable-line react-hooks/exhaustive-deps

  const showAllowOverlay = !cameraReady && permissionUi !== "requesting";
  const switching = permissionUi === "requesting" && cameraReady;

  return (
    <div>
      <div
        className="page-banner"
        style={{
          marginBottom: 20,
          background: "linear-gradient(135deg, #1a365d, var(--primary))",
          borderRadius: "var(--radius)",
          padding: "16px 22px",
          color: "white",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "Playfair Display, serif" }}>
            <i className="fa-solid fa-qrcode" style={{ marginRight: 10 }} />
            Search QR Code
          </div>
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
            Signed bill QRs only — opens booking in Fancy Collection
          </div>
        </div>
        <Link
          href="/"
          className="btn btn-sm"
          style={{ background: "rgba(255,255,255,0.15)", color: "white", border: "1.5px solid rgba(255,255,255,0.35)" }}
        >
          <i className="fa-solid fa-arrow-left" style={{ marginRight: 6 }} />
          Dashboard
        </Link>
      </div>

      {error && (
        <div className="alert alert-warning" style={{ marginBottom: 16 }} role="alert">
          {error}
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <h3 className="card-title">Camera Scanner</h3>
          {cameraReady && (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => void stopCamera()}>
              Stop
            </button>
          )}
        </div>
        <div className="card-body">
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }} suppressHydrationWarning>
            {mounted ? cameraHint(isMobile) : "Allow camera access, then align the QR inside the frame."}
          </p>

          <div style={{ position: "relative", maxWidth: 420, margin: "0 auto" }}>
            <div
              id="qr-camera-reader"
              style={{
                width: "100%",
                minHeight: cameraReady ? 320 : 220,
                borderRadius: 8,
                overflow: "hidden",
                background: "#000",
              }}
            />

            {cameraReady && (
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                  borderRadius: 8,
                  overflow: "hidden",
                }}
              >
                {/* Shaded reticle — guides distance & alignment for small QRs */}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "rgba(0,0,0,0.35)",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    width: "min(78%, 280px)",
                    aspectRatio: "1",
                    boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
                    border: "2px solid rgba(255,255,255,0.95)",
                    borderRadius: 12,
                    outline: "1px solid rgba(255,255,255,0.25)",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    width: "min(78%, 280px)",
                    aspectRatio: "1",
                    borderRadius: 12,
                  }}
                >
                  <span style={{ position: "absolute", top: -2, left: -2, width: 22, height: 22, borderTop: "3px solid #fff", borderLeft: "3px solid #fff", borderRadius: "4px 0 0 0" }} />
                  <span style={{ position: "absolute", top: -2, right: -2, width: 22, height: 22, borderTop: "3px solid #fff", borderRight: "3px solid #fff", borderRadius: "0 4px 0 0" }} />
                  <span style={{ position: "absolute", bottom: -2, left: -2, width: 22, height: 22, borderBottom: "3px solid #fff", borderLeft: "3px solid #fff", borderRadius: "0 0 0 4px" }} />
                  <span style={{ position: "absolute", bottom: -2, right: -2, width: 22, height: 22, borderBottom: "3px solid #fff", borderRight: "3px solid #fff", borderRadius: "0 0 4px 0" }} />
                </div>
                <p
                  style={{
                    position: "absolute",
                    bottom: 10,
                    left: 0,
                    right: 0,
                    textAlign: "center",
                    margin: 0,
                    fontSize: 11,
                    color: "rgba(255,255,255,0.9)",
                    textShadow: "0 1px 3px rgba(0,0,0,0.8)",
                  }}
                >
                  Align QR inside frame · hold 15–25 cm from screen or bill
                </p>
              </div>
            )}

            {showAllowOverlay && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 20,
                  background: "rgba(255,255,255,0.92)",
                  borderRadius: 8,
                  textAlign: "center",
                  gap: 12,
                }}
              >
                <i className="fa-solid fa-video" style={{ fontSize: 36, color: "var(--primary)" }} />
                <p style={{ fontSize: 14, margin: 0, fontWeight: 600 }}>Allow camera to scan bill QR</p>
                <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, lineHeight: 1.45 }}>
                  Click below, then click <strong>Allow</strong> when your browser asks for camera access.
                </p>
                <button type="button" className="btn btn-primary btn-lg" onClick={() => void allowCameraAndScan()}>
                  <i className="fa-solid fa-camera" style={{ marginRight: 8 }} />
                  Allow Camera Access
                </button>
              </div>
            )}

            {(permissionUi === "requesting" && !cameraReady) || switching ? (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(255,255,255,0.9)",
                  borderRadius: 8,
                }}
              >
                <div className="spinner" style={{ marginBottom: 12 }} />
                <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>
                  {switching ? "Switching camera…" : "Opening camera…"}
                </p>
              </div>
            ) : null}
          </div>

          {cameraReady && status && (
            <>
              <p style={{ textAlign: "center", color: "var(--success)", fontSize: 13, marginTop: 12, marginBottom: 12 }}>
                <i className="fa-solid fa-circle-check" style={{ marginRight: 6 }} />
                {status.label} — {status.engine === "native" ? "fast scan" : "scanning"} active
              </p>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={switching}
                  onClick={() => void switchCamera()}
                >
                  <i className="fa-solid fa-camera-rotate" style={{ marginRight: 8 }} />
                  Switch Camera
                  {status.deviceCount > 1
                    ? ` (${status.deviceIndex + 1}/${status.deviceCount})`
                    : ` → ${cameraFacingLabel(otherCameraFacing(status.facing))}`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Manual entry</h3>
        </div>
        <div className="card-body">
          <label className="form-label">Paste full QR text from bill (includes security code)</label>
          <input
            type="text"
            className="form-control"
            placeholder="Paste signed QR URL from bill…"
            value={manualToken}
            onChange={(e) => setManualToken(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && manualToken.trim() && void goToToken(manualToken)}
          />
          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: 12 }}
            disabled={!manualToken.trim()}
            onClick={() => void goToToken(manualToken)}
          >
            Open Booking
          </button>
        </div>
      </div>
    </div>
  );
}

function isNotAllowedError(e: unknown): boolean {
  const name = e instanceof DOMException ? e.name : e instanceof Error ? e.name : "";
  return name === "NotAllowedError" || name === "PermissionDeniedError";
}

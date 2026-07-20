"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ScannerStatus } from "@/lib/cameraScanner";
import {
  createScanDedupeGate,
  isCurrentScanGeneration,
  readPersistedScanSession,
  type ValidatedScanWindow,
  validateScanWindow,
  writePersistedScanSession,
} from "@/lib/dressScanSession";
import {
  canOpenDelivery,
  canOpenJewellerySelection,
  canOpenReturn,
  scanRecordReasonLabel,
} from "@/lib/scanRecordActions";

type ApiRecord = {
  bookingId: number;
  bookingNumber: string;
  monthlySerial: number;
  customerName: string;
  contact: string;
  dressName: string;
  deliveryDateTime: string;
  returnDateTime: string;
  bookingStatus: string;
  itemStatus: string;
  reason: string;
};

type ApiResult = {
  ok: boolean;
  status:
    | "AVAILABLE"
    | "BOOKED"
    | "WARNING_RETURNING_ON_DELIVERY_DAY"
    | "WARNING_BOOKED_ON_RETURN_DAY"
    | "WARNING_BOTH_BOUNDARIES"
    | "MAINTENANCE"
    | "INACTIVE"
    | "CODE_NOT_FOUND"
    | "AMBIGUOUS_LEGACY_CODE";
  dress: {
    id: number;
    name: string;
    sku: string;
    category: string;
    size: string | null;
    colour: string | null;
    status: string;
    thumbnailUrl: string | null;
  } | null;
  blockingRecords: ApiRecord[];
  warningRecords: ApiRecord[];
  error?: string;
  timing?: { totalMs?: number; cacheStatus?: string };
};

type ScanRow = {
  id: string;
  scannedCode: string;
  scannedAt: string;
  result: ApiResult;
};

type CameraSession = {
  start: (
    onDecode: (text: string) => void,
  ) => Promise<ScannerStatus>;
  switchCamera: (
    onDecode: (text: string) => void,
  ) => Promise<ScannerStatus>;
  pause: () => void;
  resume: () => void;
  stop: () => Promise<void>;
};

const statusCopy: Record<
  ApiResult["status"],
  { label: string; detail: string; tone: string }
> = {
  AVAILABLE: {
    label: "AVAILABLE",
    detail: "Available for selected dates",
    tone: "#1f7a4d",
  },
  BOOKED: {
    label: "BOOKED",
    detail: "Booked during the selected period",
    tone: "#b42318",
  },
  WARNING_RETURNING_ON_DELIVERY_DAY: {
    label: "RETURNING ON DELIVERY DATE",
    detail:
      "Warning: This dress is returning on your delivery date. Confirm the dress is returned and prepared before delivery.",
    tone: "#9a6700",
  },
  WARNING_BOOKED_ON_RETURN_DAY: {
    label: "BOOKED ON RETURN DATE",
    detail:
      "Warning: This dress has another booking on your return date. The dress must be returned on time.",
    tone: "#9a6700",
  },
  WARNING_BOTH_BOUNDARIES: {
    label: "BOTH BOUNDARY WARNINGS",
    detail:
      "Warning: This dress is returning on the delivery date and has another booking on the return date.",
    tone: "#9a6700",
  },
  MAINTENANCE: {
    label: "MAINTENANCE",
    detail: "This dress is under maintenance and is not available.",
    tone: "#b54708",
  },
  INACTIVE: {
    label: "INACTIVE",
    detail: "This dress is inactive and is not available.",
    tone: "#667085",
  },
  CODE_NOT_FOUND: {
    label: "NOT LINKED",
    detail: "QR/barcode is not linked to inventory.",
    tone: "#667085",
  },
  AMBIGUOUS_LEGACY_CODE: {
    label: "AMBIGUOUS",
    detail: "This legacy code matches more than one inventory SKU.",
    tone: "#b54708",
  },
};

function nowTime(): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date());
}

function BookingRecords({ records }: { records: ApiRecord[] }) {
  if (!records.length) return null;
  return (
    <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
      {records.map((record) => (
        <div
          key={`${record.bookingId}-${record.reason}`}
          data-testid="scan-booking-record"
          style={{
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: 10,
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          <div>
            <strong>{record.bookingNumber || `Booking ${record.bookingId}`}</strong>
            {" · "}
            Monthly serial {record.monthlySerial}
          </div>
          <div>
            {record.customerName}
            {record.contact ? ` · ${record.contact}` : ""}
          </div>
          <div>
            Delivery: {record.deliveryDateTime}
            {" · "}
            Return: {record.returnDateTime}
          </div>
          <div>
            Booking status: {record.bookingStatus}
            {" · "}
            Item status: {record.itemStatus}
          </div>
          <div style={{ color: "var(--text-muted)", marginTop: 4 }}>
            {scanRecordReasonLabel(record.reason)}
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              marginTop: 10,
            }}
          >
            <Link
              href={`/booking/${record.bookingId}`}
              prefetch={false}
              className="btn btn-outline btn-sm"
              data-testid="open-booking-record"
            >
              Open Booking Record
            </Link>
            {canOpenDelivery(record) ? (
              <Link
                href={`/booking-delivery/${record.bookingId}`}
                prefetch={false}
                className="btn btn-outline btn-sm"
              >
                Open Delivery
              </Link>
            ) : null}
            {canOpenReturn(record) ? (
              <Link
                href={`/return/${record.bookingId}`}
                prefetch={false}
                className="btn btn-outline btn-sm"
              >
                Open Return
              </Link>
            ) : null}
            {canOpenJewellerySelection(record) ? (
              <Link
                href={`/jewellery-selection/${record.bookingId}`}
                prefetch={false}
                className="btn btn-outline btn-sm"
              >
                Open Jewellery Selection
              </Link>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function DressAvailabilityScanner({
  canManageScanCodes = false,
}: {
  canManageScanCodes?: boolean;
}) {
  const restoredRef = useRef(false);
  const [deliveryDate, setDeliveryDate] = useState("");
  const [deliveryTime, setDeliveryTime] = useState("12:00");
  const [returnDate, setReturnDate] = useState("");
  const [returnTime, setReturnTime] = useState("12:00");
  const [activeWindow, setActiveWindow] = useState<ValidatedScanWindow | null>(
    null,
  );
  const [phase, setPhase] = useState<"dates" | "scanning">("dates");
  const [windowError, setWindowError] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [cameraStatus, setCameraStatus] = useState<ScannerStatus | null>(null);
  const [cameraPaused, setCameraPaused] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [feedback, setFeedback] = useState(
    "Enter a booking window to start scanning.",
  );
  const [manualCode, setManualCode] = useState("");
  const [rows, setRows] = useState<ScanRow[]>([]);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const sessionRef = useRef<CameraSession | null>(null);
  const generationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const queueRef = useRef<Array<{ code: string; force: boolean }>>([]);
  const requestActiveRef = useRef(false);
  const dedupeRef = useRef(createScanDedupeGate());
  const codeResultRef = useRef(new Map<string, string>());
  const dressResultRef = useRef(new Map<number, string>());
  const scanHandlerRef = useRef<(code: string) => void>(() => undefined);
  const scanLockedRef = useRef(false);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const highlight = useCallback((id: string) => {
    setHighlightId(id);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => setHighlightId(null), 1_800);
    document
      .getElementById(`scan-result-${id}`)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  const rebuildIndexes = useCallback((nextRows: ScanRow[]) => {
    codeResultRef.current.clear();
    dressResultRef.current.clear();
    for (const row of nextRows) {
      codeResultRef.current.set(row.scannedCode, row.id);
      if (row.result.dress) dressResultRef.current.set(row.result.dress.id, row.id);
    }
  }, []);

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const saved = readPersistedScanSession();
    if (!saved) return;
    setDeliveryDate(saved.deliveryDate);
    setDeliveryTime(saved.deliveryTime);
    setReturnDate(saved.returnDate);
    setReturnTime(saved.returnTime);
    setPhase(saved.phase);
    if (saved.phase === "scanning") {
      try {
        const window = validateScanWindow({
          deliveryDate: saved.deliveryDate,
          deliveryTime: saved.deliveryTime,
          returnDate: saved.returnDate,
          returnTime: saved.returnTime,
        });
        setActiveWindow(window);
      } catch {
        setPhase("dates");
        setActiveWindow(null);
        return;
      }
    }
    const savedRows = saved.rows as ScanRow[];
    if (savedRows.length) {
      setRows(savedRows);
      rebuildIndexes(savedRows);
      for (const row of savedRows) {
        dedupeRef.current.claim(row.scannedCode, Date.now(), true);
      }
    }
  }, [rebuildIndexes]);

  useEffect(() => {
    writePersistedScanSession({
      deliveryDate,
      deliveryTime,
      returnDate,
      returnTime,
      phase,
      rows,
    });
  }, [deliveryDate, deliveryTime, returnDate, returnTime, phase, rows]);

  const drainQueue = useCallback(async function drainQueueInner() {
    if (requestActiveRef.current || !activeWindow) return;
    const next = queueRef.current.shift();
    if (!next) {
      setFeedback("Ready for next scan.");
      return;
    }

    const requestGeneration = generationRef.current;
    requestActiveRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    setFeedback("Code scanned — checking availability…");

    try {
      const response = await fetch("/api/dress-checker/scan-availability", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          code: next.code,
          deliveryDateTime: activeWindow.deliveryDateTime,
          returnDateTime: activeWindow.returnDateTime,
          excludeBookingId: null,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as
        | ApiResult
        | { error?: string };
      if (
        controller.signal.aborted ||
        !isCurrentScanGeneration(requestGeneration, generationRef.current)
      ) {
        return;
      }
      if (!("status" in payload)) {
        dedupeRef.current.forget(next.code);
        if (response.status === 401) {
          setFeedback("Session expired. Sign in again to continue scanning.");
        } else {
          setFeedback(
            ("error" in payload && payload.error) ||
              "Could not check this code. Scan again.",
          );
        }
        return;
      }

      const result = payload as ApiResult;
      const existingDressId = result.dress
        ? dressResultRef.current.get(result.dress.id)
        : undefined;
      const existingCodeId = codeResultRef.current.get(next.code);
      const existingId = existingDressId || existingCodeId;
      if (existingId && !next.force) {
        highlight(existingId);
        setFeedback("Already scanned. Use Recheck to refresh this result.");
        return;
      }

      const id =
        existingId ||
        `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      const row: ScanRow = {
        id,
        scannedCode: next.code,
        scannedAt: nowTime(),
        result,
      };
      setRows((current) => {
        const updated = existingId
          ? current.map((candidate) => (candidate.id === existingId ? row : candidate))
          : [row, ...current];
        rebuildIndexes(updated);
        return updated;
      });
      highlight(id);

      const session = sessionRef.current;
      if (session) {
        try { void session.stop(); } catch { /* already stopped */ }
        sessionRef.current = null;
      }
      setCameraActive(false);
      scanLockedRef.current = true;
      setFeedback(
        result.status === "AVAILABLE"
          ? "✓ Dress scanned successfully — Camera has been turned off."
          : "✓ Result received — Camera has been turned off.",
      );
    } catch (error) {
      if (
        !controller.signal.aborted &&
        isCurrentScanGeneration(requestGeneration, generationRef.current)
      ) {
        dedupeRef.current.forget(next.code);
        setFeedback(
          error instanceof Error
            ? `Availability check failed: ${error.message}`
            : "Availability check failed. Scan again.",
        );
      }
    } finally {
      if (isCurrentScanGeneration(requestGeneration, generationRef.current)) {
        requestActiveRef.current = false;
        abortRef.current = null;
        window.setTimeout(() => void drainQueueInner(), 0);
      }
    }
  }, [activeWindow, highlight, rebuildIndexes]);

  const enqueue = useCallback(
    (rawCode: string, force = false) => {
      if (scanLockedRef.current && !force) return;
      const claim = dedupeRef.current.claim(rawCode, Date.now(), force);
      if (!claim.accepted) {
        if (claim.reason === "already-scanned") {
          const existingId = codeResultRef.current.get(claim.code);
          if (existingId) highlight(existingId);
          setFeedback("Already scanned. Use Recheck to refresh this result.");
        }
        return;
      }
      setFeedback("Code scanned — checking availability…");
      if (
        !queueRef.current.some((queued) => queued.code === claim.code)
      ) {
        queueRef.current.push({ code: claim.code, force });
      }
      void drainQueue();
    },
    [drainQueue, highlight],
  );

  scanHandlerRef.current = enqueue;

  useEffect(() => {
    if (phase !== "scanning") return;
    let cancelled = false;
    const decode = (code: string) => scanHandlerRef.current(code);

    void (async () => {
      try {
        const { QrCameraSession } = await import("@/lib/cameraScanner");
        if (cancelled) return;
        const session = new QrCameraSession("dress-availability-camera");
        sessionRef.current = session;
        scanLockedRef.current = false;
        const status = await session.start(decode);
        if (!cancelled) {
          setCameraStatus(status);
          setCameraActive(true);
          setCameraError("");
          setFeedback("Camera ready. Scan a dress QR code or Code 128 barcode.");
        }
      } catch (error) {
        if (cancelled) return;
        const { cameraErrorMessage } = await import("@/lib/cameraScanner");
        setCameraError(
          cameraErrorMessage(error, window.isSecureContext),
        );
        setFeedback("Camera unavailable. Use manual code entry below.");
      }
    })();

    const mockDecode = (event: Event) => {
      const code = (event as CustomEvent<{ code?: string }>).detail?.code;
      if (code) decode(code);
    };
    window.addEventListener("dress-scan-mock", mockDecode);

    return () => {
      cancelled = true;
      window.removeEventListener("dress-scan-mock", mockDecode);
      const session = sessionRef.current;
      sessionRef.current = null;
      setCameraActive(false);
      if (session) void session.stop();
    };
  }, [phase]);

  useEffect(
    () => () => {
      generationRef.current += 1;
      abortRef.current?.abort();
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    },
    [],
  );

  function startScanning() {
    try {
      const window = validateScanWindow({
        deliveryDate,
        deliveryTime,
        returnDate,
        returnTime,
      });
      generationRef.current += 1;
      scanLockedRef.current = false;
      setActiveWindow(window);
      setWindowError("");
      setCameraError("");
      setCameraActive(false);
      setPhase("scanning");
    } catch (error) {
      setWindowError(
        error instanceof Error ? error.message : "Enter a valid booking window.",
      );
    }
  }

  function changeDates() {
    generationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    requestActiveRef.current = false;
    queueRef.current = [];
    dedupeRef.current.clear();
    codeResultRef.current.clear();
    dressResultRef.current.clear();
    setRows([]);
    setActiveWindow(null);
    setCameraPaused(false);
    setPhase("dates");
    setFeedback("Dates changed — previous scan results were cleared.");
  }

  function clearRows() {
    dedupeRef.current.clear();
    codeResultRef.current.clear();
    dressResultRef.current.clear();
    setRows([]);
    setHighlightId(null);
    setFeedback("Scanned list cleared. Ready for next scan.");
  }

  function removeRow(row: ScanRow) {
    dedupeRef.current.forget(row.scannedCode);
    setRows((current) => {
      const updated = current.filter((candidate) => candidate.id !== row.id);
      rebuildIndexes(updated);
      return updated;
    });
  }

  async function switchCamera() {
    const session = sessionRef.current;
    if (!session) return;
    try {
      setFeedback("Switching camera…");
      const status = await session.switchCamera((code) =>
        scanHandlerRef.current(code),
      );
      setCameraStatus(status);
      setFeedback("Camera switched. Ready to scan.");
    } catch (error) {
      const { cameraErrorMessage } = await import("@/lib/cameraScanner");
      setCameraError(cameraErrorMessage(error, window.isSecureContext));
    }
  }

  function togglePause() {
    const session = sessionRef.current;
    if (!session) return;
    if (cameraPaused) {
      session.resume();
      setCameraPaused(false);
      setFeedback("Camera resumed. Ready to scan.");
    } else {
      session.pause();
      setCameraPaused(true);
      setFeedback("Camera paused. Manual entry remains available.");
    }
  }

  function submitManual(event: React.FormEvent) {
    event.preventDefault();
    const code = manualCode;
    setManualCode("");
    enqueue(code);
  }

  if (phase === "dates") {
    return (
      <div>
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">1. Enter booking window</h2>
          </div>
          <div className="card-body">
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
              Dates and times are interpreted in Asia/Kolkata and stay selected
              while you scan multiple dresses.
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                gap: 12,
                marginTop: 14,
              }}
            >
              <label className="form-group">
                <span className="form-label">Delivery Date</span>
                <input
                  aria-label="Delivery Date"
                  className="form-control"
                  type="date"
                  value={deliveryDate}
                  onChange={(event) => setDeliveryDate(event.target.value)}
                />
              </label>
              <label className="form-group">
                <span className="form-label">Delivery Time</span>
                <input
                  aria-label="Delivery Time"
                  className="form-control"
                  type="time"
                  value={deliveryTime}
                  onChange={(event) => setDeliveryTime(event.target.value)}
                />
              </label>
              <label className="form-group">
                <span className="form-label">Return Date</span>
                <input
                  aria-label="Return Date"
                  className="form-control"
                  type="date"
                  value={returnDate}
                  onChange={(event) => setReturnDate(event.target.value)}
                />
              </label>
              <label className="form-group">
                <span className="form-label">Return Time</span>
                <input
                  aria-label="Return Time"
                  className="form-control"
                  type="time"
                  value={returnTime}
                  onChange={(event) => setReturnTime(event.target.value)}
                />
              </label>
            </div>
            {windowError ? (
              <div role="alert" style={{ color: "#b42318", marginTop: 12 }}>
                {windowError}
              </div>
            ) : null}
            <button
              type="button"
              className="btn btn-primary"
              style={{ marginTop: 16 }}
              onClick={startScanning}
            >
              <i className="fa-solid fa-camera" /> Start Scanning
            </button>
          </div>
        </div>
        {feedback.startsWith("Dates changed") ? (
          <div role="status" style={{ marginTop: 12 }}>
            {feedback}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <div
        className="card"
        style={{ marginBottom: 14, border: "2px solid var(--gold)" }}
      >
        <div className="card-header">
          <h2 className="card-title">2. Scan dress</h2>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {activeWindow?.deliveryDate} {activeWindow?.deliveryTime} →{" "}
            {activeWindow?.returnDate} {activeWindow?.returnTime} IST
          </span>
        </div>
        <div className="card-body">
          <div
            id="dress-availability-camera"
            data-testid="dress-availability-camera"
            style={{
              width: "100%",
              maxWidth: 720,
              minHeight: 260,
              aspectRatio: "4 / 3",
              margin: "0 auto",
              background: "#111",
              borderRadius: 12,
              overflow: "hidden",
            }}
          />
          <div
            role="status"
            aria-live="polite"
            data-testid="scan-feedback"
            style={{
              marginTop: 12,
              padding: 10,
              borderRadius: 8,
              background: "var(--bg)",
              fontWeight: 700,
            }}
          >
            {feedback}
          </div>
          {cameraError ? (
            <div role="alert" style={{ color: "#b42318", marginTop: 10 }}>
              {cameraError}
            </div>
          ) : null}
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              marginTop: 12,
            }}
          >
            {cameraActive && (
              <>
                <button type="button" className="btn btn-outline btn-sm" onClick={togglePause}>
                  {cameraPaused ? "Resume Camera" : "Pause Camera"}
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => void switchCamera()}
                  disabled={!cameraStatus?.canSwitch}
                >
                  Switch Camera
                </button>
              </>
            )}
            <button type="button" className="btn btn-outline btn-sm" onClick={changeDates}>
              Change Dates
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={clearRows}>
              Clear Scanned List
            </button>
            {!cameraActive && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  scanLockedRef.current = false;
                  setCameraPaused(false);
                  setFeedback("Opening camera…");
                  const decode = (code: string) => scanHandlerRef.current(code);
                  void (async () => {
                    try {
                      const { QrCameraSession } = await import("@/lib/cameraScanner");
                      const session = new QrCameraSession("dress-availability-camera");
                      sessionRef.current = session;
                      const status = await session.start(decode);
                      setCameraStatus(status);
                      setCameraActive(true);
                      setCameraError("");
                      setFeedback("Camera ready. Scan a dress QR code or Code 128 barcode.");
                    } catch (error) {
                      const { cameraErrorMessage } = await import("@/lib/cameraScanner");
                      setCameraError(cameraErrorMessage(error, window.isSecureContext));
                      setFeedback("Camera unavailable. Use manual code entry below.");
                    }
                  })();
                }}
              >
                Scan Next Dress
              </button>
            )}
          </div>
          {cameraStatus ? (
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
              {cameraStatus.label} · {cameraStatus.engine} decoder
            </div>
          ) : null}

          <form
            onSubmit={submitManual}
            style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}
          >
            <label style={{ flex: "1 1 260px" }}>
              <span className="form-label">Manual Code Entry / USB scanner</span>
              <input
                aria-label="Manual Code Entry"
                className="form-control"
                autoComplete="off"
                value={manualCode}
                onChange={(event) => setManualCode(event.target.value)}
                placeholder="Scan or type code, then press Enter"
              />
            </label>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ alignSelf: "flex-end" }}
            >
              Check Code
            </button>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Scanned dresses ({rows.length})</h2>
        </div>
        <div className="card-body">
          {!rows.length ? (
            <p style={{ color: "var(--text-muted)" }}>
              No dresses scanned in this session yet.
            </p>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {rows.map((row) => {
                const copy = statusCopy[row.result.status];
                const records = [
                  ...row.result.blockingRecords,
                  ...row.result.warningRecords,
                ];
                return (
                  <article
                    id={`scan-result-${row.id}`}
                    key={row.id}
                    data-testid="scan-result"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "80px minmax(0, 1fr)",
                      gap: 12,
                      border: `2px solid ${
                        highlightId === row.id ? "var(--gold)" : "var(--border)"
                      }`,
                      boxShadow:
                        highlightId === row.id
                          ? "0 0 0 3px rgba(184,134,11,0.16)"
                          : "none",
                      borderRadius: 10,
                      padding: 12,
                      transition: "border-color 0.15s, box-shadow 0.15s",
                    }}
                  >
                    <div
                      style={{
                        width: 80,
                        height: 96,
                        borderRadius: 8,
                        background: "var(--bg)",
                        overflow: "hidden",
                        display: "grid",
                        placeItems: "center",
                      }}
                    >
                      {row.result.dress?.thumbnailUrl ? (
                        // Only the dedicated thumbnail URL is returned by the API.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={row.result.dress.thumbnailUrl}
                          alt=""
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : (
                        <i className="fa-solid fa-shirt" aria-hidden="true" />
                      )}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <div>
                          <strong style={{ fontSize: 16 }}>
                            {row.result.dress?.name || "Unknown dress code"}
                          </strong>
                          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                            {row.result.dress
                              ? `${row.result.dress.sku} · Size ${
                                  row.result.dress.size || "—"
                                } · ${row.result.dress.colour || "No colour"}`
                              : row.scannedCode}
                          </div>
                        </div>
                        <strong style={{ color: copy.tone }}>{copy.label}</strong>
                      </div>
                      <p style={{ margin: "8px 0 0", color: copy.tone }}>
                        {copy.detail}
                      </p>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
                        Scanned code: <code>{row.scannedCode}</code> · {row.scannedAt}
                        {typeof row.result.timing?.totalMs === "number"
                          ? ` · ${row.result.timing.totalMs} ms`
                          : ""}
                      </div>
                      <BookingRecords records={records} />
                      {canManageScanCodes &&
                      (row.result.status === "CODE_NOT_FOUND" ||
                        row.result.status === "AMBIGUOUS_LEGACY_CODE") ? (
                        <div style={{ marginTop: 10 }}>
                          <Link
                            href="/inventory"
                            prefetch={false}
                            className="btn btn-outline btn-sm"
                            data-testid="open-inventory-code-management"
                          >
                            Open inventory code management
                          </Link>
                        </div>
                      ) : null}
                      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => enqueue(row.scannedCode, true)}
                        >
                          Recheck
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => removeRow(row)}
                        >
                          Remove One Result
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

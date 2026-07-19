"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import JsBarcode from "jsbarcode";
import {
  buildInventoryLabelDocument,
  type InventoryLabelSize,
} from "@/lib/inventoryScanLabel";
import {
  cameraErrorMessage,
  QrCameraSession,
  type DetectedBarcodeFormat,
  type ScannerStatus,
} from "@/lib/cameraScanner";

type ScanCode = {
  id: number;
  code: string;
  normalizedCode: string;
  format: string;
  source: string;
  isPrimary: boolean;
  active: boolean;
  createdAt: string;
};

type InventorySummary = {
  id: number;
  sku: string;
  name: string;
  size: string | null;
  color: string | null;
  scanCodes: ScanCode[];
};

export default function InventoryScanCodeManager({
  inventoryId,
  name = "",
  sku = "",
  size,
  color,
  compact = false,
}: {
  inventoryId?: number;
  name?: string;
  sku?: string;
  size?: string | null;
  color?: string | null;
  compact?: boolean;
}) {
  const [inventory, setInventory] = useState<InventorySummary | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [manualFormat, setManualFormat] = useState<DetectedBarcodeFormat>("UNKNOWN");
  const [loading, setLoading] = useState(Boolean(inventoryId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<ScannerStatus | null>(null);
  const [detected, setDetected] = useState<{
    code: string;
    format: DetectedBarcodeFormat;
  } | null>(null);
  const [labelSize, setLabelSize] = useState<InventoryLabelSize>("compact");
  const scannerRef = useRef<QrCameraSession | null>(null);
  const handledRef = useRef(false);

  const load = useCallback(async () => {
    if (!inventoryId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/inventory/${inventoryId}/scan-codes`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const data = (await response.json().catch(() => ({}))) as {
        inventory?: InventorySummary;
        error?: string;
      };
      if (!response.ok || !data.inventory) {
        throw new Error(data.error || "Could not load QR/barcode mappings.");
      }
      setInventory(data.inventory);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load QR/barcode mappings.");
    } finally {
      setLoading(false);
    }
  }, [inventoryId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(
    () => () => {
      void scannerRef.current?.stop();
      scannerRef.current = null;
    },
    [],
  );

  async function mutate(body: Record<string, unknown>) {
    if (!inventoryId) return null;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/inventory/${inventoryId}/scan-codes`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => ({}))) as {
        inventory?: InventorySummary;
        scanCode?: ScanCode;
        labelFormat?: "QR_CODE" | "CODE_128";
        reused?: boolean;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || "Could not update QR/barcode.");
      if (data.inventory) setInventory(data.inventory);
      return data;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update QR/barcode.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function assign(code: string, format: DetectedBarcodeFormat, source: string) {
    const result = await mutate({ action: "assign", code, format, source });
    if (!result) return false;
    setManualCode("");
    setNotice("QR/barcode assigned to this physical inventory unit.");
    return true;
  }

  async function submitManual() {
    if (!manualCode.trim()) {
      setError("Enter or scan a QR/barcode value.");
      return;
    }
    await assign(manualCode, manualFormat, "MANUAL");
  }

  const closeScanner = useCallback(async () => {
    await scannerRef.current?.stop();
    scannerRef.current = null;
    handledRef.current = false;
    setScannerOpen(false);
    setCameraStatus(null);
    setDetected(null);
  }, []);

  const openScanner = useCallback(async () => {
    setScannerOpen(true);
    setDetected(null);
    setCameraStatus(null);
    setError("");
    handledRef.current = false;
    try {
      const session = new QrCameraSession("inventory-code-camera");
      scannerRef.current = session;
      const status = await session.start((code, format = "UNKNOWN") => {
        if (handledRef.current) return;
        handledRef.current = true;
        session.stopImmediately();
        void session.disposeInBackground();
        setCameraStatus(null);
        setDetected({ code, format });
      });
      setCameraStatus(status);
    } catch (cause) {
      await scannerRef.current?.stop();
      scannerRef.current = null;
      setError(
        cameraErrorMessage(
          cause,
          typeof window !== "undefined" ? window.isSecureContext : true,
        ),
      );
      setScannerOpen(false);
    }
  }, []);

  async function confirmDetected() {
    if (!detected) return;
    const saved = await assign(detected.code, detected.format, "EXISTING_PRINTED");
    if (saved) await closeScanner();
  }

  async function generate(labelFormat: "QR_CODE" | "CODE_128") {
    const result = await mutate({ action: "generate", labelFormat });
    if (!result?.scanCode) return;
    setNotice(
      result.reused
        ? "Reusing the existing secure internal code. Printing does not create another mapping."
        : "Secure internal dress code generated.",
    );
    await printLabel(result.scanCode, labelFormat);
  }

  async function deactivate(code: ScanCode) {
    const warning = code.isPrimary
      ? "This is the primary code. Deactivate it? Another active code will become primary when available."
      : "Deactivate this QR/barcode? It will stop resolving immediately.";
    if (!window.confirm(warning)) return;
    const result = await mutate({
      action: "deactivate",
      scanCodeId: code.id,
      confirmPrimary: code.isPrimary,
    });
    if (result) setNotice("QR/barcode deactivated.");
  }

  async function setPrimary(code: ScanCode) {
    const result = await mutate({ action: "set_primary", scanCodeId: code.id });
    if (result) setNotice("Primary QR/barcode updated.");
  }

  async function printLabel(code: ScanCode, format: "QR_CODE" | "CODE_128") {
    const popup = window.open("", "_blank", "width=520,height=620");
    if (!popup) {
      setError("Pop-up blocked. Allow pop-ups to print the label.");
      return;
    }
    popup.document.write("<p style='font-family:sans-serif;padding:20px'>Preparing label…</p>");

    let symbol = "";
    if (format === "QR_CODE") {
      const dataUrl = await QRCode.toDataURL(code.code, {
        width: 280,
        margin: 1,
        errorCorrectionLevel: "M",
      });
      symbol = `<img class="qr" src="${dataUrl}" alt="QR code">`;
    } else {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      JsBarcode(svg, code.code, {
        format: "CODE128",
        displayValue: false,
        margin: 0,
        height: 72,
        width: 2,
      });
      symbol = new XMLSerializer().serializeToString(svg);
    }

    popup.document.open();
    popup.document.write(
      buildInventoryLabelDocument({
        code: code.code,
        itemName: inventory?.name || name || "Inventory item",
        sku: inventory?.sku || sku,
        size: inventory?.size ?? size,
        color: inventory?.color ?? color,
        symbolHtml: symbol,
        labelSize,
      }),
    );
    popup.document.close();
  }

  if (!inventoryId) {
    return (
      <section className="card" data-testid="inventory-scan-code-manager">
        <div className="card-header">
          <h3 className="card-title">QR / Barcode</h3>
        </div>
        <div className="card-body">
          <p style={{ margin: 0, color: "var(--text-muted)" }}>
            Save the inventory item first. Codes are assigned to one physical unit, so
            quantity-based items are managed individually after creation.
          </p>
        </div>
      </section>
    );
  }

  const codes = inventory?.scanCodes ?? [];
  const activeCodes = codes.filter((code) => code.active);

  return (
    <section
      className="card"
      data-testid="inventory-scan-code-manager"
      style={compact ? { marginTop: 12 } : undefined}
    >
      <div className="card-header">
        <h3 className="card-title">QR / Barcode</h3>
      </div>
      <div className="card-body" style={{ display: "grid", gap: 14 }}>
        <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 13 }}>
          Codes below identify this physical inventory unit only.
        </p>
        {loading ? <p>Loading codes…</p> : null}
        {error ? <div className="alert alert-danger">{error}</div> : null}
        {notice ? <div className="alert alert-success">{notice}</div> : null}

        <div
          style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}
        >
          <label style={{ flex: "1 1 220px" }}>
            <span className="form-label">Manual / USB scanner entry</span>
            <input
              className="form-control"
              value={manualCode}
              onChange={(event) => setManualCode(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void submitManual();
                }
              }}
              placeholder="Scan or type code, then press Enter"
              autoComplete="off"
            />
          </label>
          <label style={{ minWidth: 130 }}>
            <span className="form-label">Format</span>
            <select
              className="form-control"
              value={manualFormat}
              onChange={(event) =>
                setManualFormat(event.target.value as DetectedBarcodeFormat)
              }
            >
              {[
                "UNKNOWN",
                "QR_CODE",
                "CODE_128",
                "CODE_39",
                "EAN_13",
                "EAN_8",
                "UPC_A",
                "UPC_E",
              ].map((format) => (
                <option key={format}>{format}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving}
            onClick={() => void submitManual()}
          >
            Assign Code
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-outline" onClick={() => void openScanner()}>
            Scan Existing Code
          </button>
          <button
            type="button"
            className="btn btn-outline"
            disabled={saving}
            onClick={() => void generate("QR_CODE")}
          >
            Generate QR Code
          </button>
          <button
            type="button"
            className="btn btn-outline"
            disabled={saving}
            onClick={() => void generate("CODE_128")}
          >
            Generate Barcode
          </button>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            Label:
            <select
              className="form-control"
              value={labelSize}
              onChange={(event) =>
                setLabelSize(event.target.value as InventoryLabelSize)
              }
              style={{ width: "auto" }}
            >
              <option value="compact">Thermal 50×30 mm</option>
              <option value="standard">Standard 70×40 mm</option>
            </select>
          </label>
        </div>

        {!loading && activeCodes.length === 0 ? (
          <p style={{ margin: 0 }}>No active QR/barcode assigned.</p>
        ) : null}
        <div style={{ display: "grid", gap: 8 }}>
          {codes.map((code) => (
            <div
              key={code.id}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: 10,
                opacity: code.active ? 1 : 0.6,
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <code style={{ overflowWrap: "anywhere" }}>{code.code}</code>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
                  {code.format} · {code.source}
                  {code.isPrimary ? " · PRIMARY" : ""}
                  {!code.active ? " · INACTIVE" : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {code.active ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      onClick={() => void printLabel(code, "QR_CODE")}
                    >
                      Print QR
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      onClick={() => void printLabel(code, "CODE_128")}
                    >
                      Print Barcode
                    </button>
                    {!code.isPrimary ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline"
                        disabled={saving}
                        onClick={() => void setPrimary(code)}
                      >
                        Make Primary
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      disabled={saving}
                      onClick={() => void deactivate(code)}
                    >
                      Deactivate
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      {scannerOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Scan existing inventory QR or barcode"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.72)",
            zIndex: 2000,
            display: "grid",
            placeItems: "center",
            padding: 12,
          }}
        >
          <div className="card" style={{ width: "min(520px, 100%)", maxHeight: "95vh", overflow: "auto" }}>
            <div className="card-header" style={{ display: "flex", justifyContent: "space-between" }}>
              <h3 className="card-title">Scan Existing Code</h3>
              <button type="button" className="btn btn-sm" onClick={() => void closeScanner()}>
                Close
              </button>
            </div>
            <div className="card-body" style={{ display: "grid", gap: 12 }}>
              {!detected ? (
                <>
                  <div
                    id="inventory-code-camera"
                    style={{ minHeight: 280, background: "#111", borderRadius: 8, overflow: "hidden" }}
                  />
                  <p style={{ margin: 0, fontSize: 13 }}>
                    Point the camera at a QR code or barcode.
                    {cameraStatus ? ` Using ${cameraStatus.label}.` : " Opening camera…"}
                  </p>
                  {cameraStatus?.canSwitch ? (
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={async () => {
                        const status = await scannerRef.current?.switchCamera(
                          (code, format = "UNKNOWN") => {
                            if (handledRef.current) return;
                            handledRef.current = true;
                            scannerRef.current?.stopImmediately();
                            setDetected({ code, format });
                          },
                        );
                        if (status) setCameraStatus(status);
                      }}
                    >
                      Switch Camera
                    </button>
                  ) : null}
                </>
              ) : (
                <>
                  <p style={{ margin: 0 }}>Detected value:</p>
                  <code style={{ padding: 12, background: "var(--bg-muted)", overflowWrap: "anywhere" }}>
                    {detected.code}
                  </code>
                  <p style={{ margin: 0 }}>Format: {detected.format}</p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={saving}
                      onClick={() => void confirmDetected()}
                    >
                      Confirm and Assign
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => {
                        handledRef.current = false;
                        setDetected(null);
                        void openScanner();
                      }}
                    >
                      Scan Again
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

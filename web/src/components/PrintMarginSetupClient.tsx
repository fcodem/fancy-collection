"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_PRINT_LABEL_MARGINS,
  loadPrintLabelMargins,
  normalizePrintLabelMargins,
  savePrintLabelMargins,
  type PrintLabelMargins,
} from "@/lib/printLabelMargins";

const FIELDS: Array<{ key: keyof PrintLabelMargins; label: string; hint: string }> = [
  { key: "pageMarginTopMm", label: "Top margin (mm)", hint: "Space above first row" },
  { key: "pageMarginBottomMm", label: "Bottom margin (mm)", hint: "Space below last row" },
  { key: "pageMarginLeftMm", label: "Left margin (mm)", hint: "Space before first column" },
  { key: "pageMarginRightMm", label: "Right margin (mm)", hint: "Space after last column" },
  { key: "colGapMm", label: "Column gap (mm)", hint: "Gap between label columns" },
  { key: "rowGapMm", label: "Row gap (mm)", hint: "Gap between label rows (usually 0)" },
  { key: "labelWidthMm", label: "Label width (mm)", hint: "Mazus default 64" },
  { key: "labelHeightMm", label: "Label height (mm)", hint: "Mazus default 33.9" },
];

export default function PrintMarginSetupClient() {
  const [margins, setMargins] = useState<PrintLabelMargins>(DEFAULT_PRINT_LABEL_MARGINS);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setMargins(loadPrintLabelMargins());
  }, []);

  function updateField(key: keyof PrintLabelMargins, value: string) {
    setMargins((prev) => normalizePrintLabelMargins({ ...prev, [key]: Number(value) }));
  }

  function save() {
    const next = normalizePrintLabelMargins(margins);
    setMargins(next);
    savePrintLabelMargins(next);
    setMessage("Saved. Print QR Codes will use these margins.");
  }

  function reset() {
    setMargins({ ...DEFAULT_PRINT_LABEL_MARGINS });
    savePrintLabelMargins(DEFAULT_PRINT_LABEL_MARGINS);
    setMessage("Reset to Mazus ST-24 factory defaults.");
  }

  return (
    <div className="card">
      <div className="card-body" style={{ display: "grid", gap: 14 }}>
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
          Tip: print one test sheet after changing margins. Use browser print settings{" "}
          <strong>100% / Actual size</strong> and margins <strong>None</strong>.
        </p>
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          }}
        >
          {FIELDS.map((f) => (
            <label key={f.key} className="form-label" style={{ display: "grid", gap: 4 }}>
              {f.label}
              <input
                type="number"
                step="0.1"
                className="form-control"
                value={margins[f.key]}
                onChange={(e) => updateField(f.key, e.target.value)}
              />
              <small className="text-muted">{f.hint}</small>
            </label>
          ))}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <button type="button" className="btn btn-primary" onClick={save}>
            Save margins
          </button>
          <button type="button" className="btn btn-outline" onClick={reset}>
            Reset Mazus defaults
          </button>
          {message ? <span style={{ fontSize: 13, color: "#15803d" }}>{message}</span> : null}
        </div>
      </div>
    </div>
  );
}

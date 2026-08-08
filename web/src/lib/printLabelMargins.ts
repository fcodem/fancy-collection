/**
 * Mazus ST-24 / Avery L7159 default geometry + user-calibrated page margins.
 * Stored in localStorage so each printer/PC can tune margins independently.
 */

export const PRINT_MARGIN_STORAGE_KEY = "fcmanage.printLabelMargins.v1";

export type PrintLabelMargins = {
  pageMarginLeftMm: number;
  pageMarginRightMm: number;
  pageMarginTopMm: number;
  pageMarginBottomMm: number;
  colGapMm: number;
  rowGapMm: number;
  labelWidthMm: number;
  labelHeightMm: number;
};

/** Factory defaults — Mazus Label A4 ST-24. */
export const DEFAULT_PRINT_LABEL_MARGINS: PrintLabelMargins = {
  pageMarginLeftMm: 6.5,
  pageMarginRightMm: 6.5,
  pageMarginTopMm: 12.9,
  pageMarginBottomMm: 12.9,
  colGapMm: 2.5,
  rowGapMm: 0,
  labelWidthMm: 64,
  labelHeightMm: 33.9,
};

export const PRINT_PAGE_W_MM = 210;
export const PRINT_PAGE_H_MM = 297;
export const PRINT_COLS = 3;
export const PRINT_ROWS = 8;

function clampMm(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function normalizePrintLabelMargins(
  raw: Partial<PrintLabelMargins> | null | undefined,
): PrintLabelMargins {
  const d = DEFAULT_PRINT_LABEL_MARGINS;
  return {
    pageMarginLeftMm: clampMm(Number(raw?.pageMarginLeftMm ?? d.pageMarginLeftMm), 0, 40),
    pageMarginRightMm: clampMm(Number(raw?.pageMarginRightMm ?? d.pageMarginRightMm), 0, 40),
    pageMarginTopMm: clampMm(Number(raw?.pageMarginTopMm ?? d.pageMarginTopMm), 0, 40),
    pageMarginBottomMm: clampMm(Number(raw?.pageMarginBottomMm ?? d.pageMarginBottomMm), 0, 40),
    colGapMm: clampMm(Number(raw?.colGapMm ?? d.colGapMm), 0, 20),
    rowGapMm: clampMm(Number(raw?.rowGapMm ?? d.rowGapMm), 0, 20),
    labelWidthMm: clampMm(Number(raw?.labelWidthMm ?? d.labelWidthMm), 40, 90),
    labelHeightMm: clampMm(Number(raw?.labelHeightMm ?? d.labelHeightMm), 20, 50),
  };
}

export function loadPrintLabelMargins(): PrintLabelMargins {
  if (typeof window === "undefined") return { ...DEFAULT_PRINT_LABEL_MARGINS };
  try {
    const raw = window.localStorage.getItem(PRINT_MARGIN_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PRINT_LABEL_MARGINS };
    return normalizePrintLabelMargins(JSON.parse(raw) as Partial<PrintLabelMargins>);
  } catch {
    return { ...DEFAULT_PRINT_LABEL_MARGINS };
  }
}

export function savePrintLabelMargins(margins: PrintLabelMargins): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    PRINT_MARGIN_STORAGE_KEY,
    JSON.stringify(normalizePrintLabelMargins(margins)),
  );
}

export function labelCellPositionWithMargins(
  slotIdx: number,
  margins: PrintLabelMargins,
  cols = PRINT_COLS,
): { leftMm: number; topMm: number } {
  const col = slotIdx % cols;
  const row = Math.floor(slotIdx / cols);
  const colPitch = margins.labelWidthMm + margins.colGapMm;
  const rowPitch = margins.labelHeightMm + margins.rowGapMm;
  return {
    leftMm: margins.pageMarginLeftMm + col * colPitch,
    topMm: margins.pageMarginTopMm + row * rowPitch,
  };
}

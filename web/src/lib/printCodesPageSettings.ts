/**
 * Remembers Print QR Codes page controls (start cell, format, filters)
 * across visits in the same browser.
 */

export const PRINT_CODES_PAGE_SETTINGS_KEY = "fcmanage.printCodesPageSettings.v1";

export type PrintFormatSetting = "QR_CODE" | "CODE_128" | "BOTH";

export type PrintCodesPageSettings = {
  startCol: number;
  startRow: number;
  printFormat: PrintFormatSetting;
  category: string;
  subCategory: string;
  search: string;
};

export const DEFAULT_PRINT_CODES_PAGE_SETTINGS: PrintCodesPageSettings = {
  startCol: 1,
  startRow: 1,
  printFormat: "QR_CODE",
  category: "",
  subCategory: "",
  search: "",
};

const PRINT_FORMATS = new Set<PrintFormatSetting>(["QR_CODE", "CODE_128", "BOTH"]);

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function normalizePrintCodesPageSettings(
  raw: Partial<PrintCodesPageSettings> | null | undefined,
): PrintCodesPageSettings {
  const d = DEFAULT_PRINT_CODES_PAGE_SETTINGS;
  const format = String(raw?.printFormat || d.printFormat) as PrintFormatSetting;
  return {
    startCol: clampInt(Number(raw?.startCol ?? d.startCol), 1, 3),
    startRow: clampInt(Number(raw?.startRow ?? d.startRow), 1, 8),
    printFormat: PRINT_FORMATS.has(format) ? format : d.printFormat,
    category: String(raw?.category ?? d.category).trim(),
    subCategory: String(raw?.subCategory ?? d.subCategory).trim(),
    search: String(raw?.search ?? d.search).trim(),
  };
}

export function loadPrintCodesPageSettings(): PrintCodesPageSettings {
  if (typeof window === "undefined") return { ...DEFAULT_PRINT_CODES_PAGE_SETTINGS };
  try {
    const raw = window.localStorage.getItem(PRINT_CODES_PAGE_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_PRINT_CODES_PAGE_SETTINGS };
    return normalizePrintCodesPageSettings(JSON.parse(raw) as Partial<PrintCodesPageSettings>);
  } catch {
    return { ...DEFAULT_PRINT_CODES_PAGE_SETTINGS };
  }
}

export function savePrintCodesPageSettings(settings: PrintCodesPageSettings): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    PRINT_CODES_PAGE_SETTINGS_KEY,
    JSON.stringify(normalizePrintCodesPageSettings(settings)),
  );
}

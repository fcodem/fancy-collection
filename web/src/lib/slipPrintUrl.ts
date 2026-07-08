/** Append auto-print flag used by slip action bars. */
export function withSlipPrintQuery(href: string): string {
  return href.includes("?") ? `${href}&print=1` : `${href}?print=1`;
}

/** Open blank tab synchronously (avoids popup blockers after async save). */
export function openBlankPrintTab(): Window | null {
  return window.open("about:blank", "_blank");
}

export function navigatePrintTab(win: Window | null, href: string): void {
  const url = withSlipPrintQuery(href);
  if (win) {
    win.location.href = url;
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

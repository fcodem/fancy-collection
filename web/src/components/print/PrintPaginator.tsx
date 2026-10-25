"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";

/** One unbreakable unit of a printed list (a record card, a section heading, the page header…). */
export type PrintBlock = {
  key: string;
  node: ReactNode;
  /** Never leave this block as the last thing on a sheet (section headings). */
  keepWithNext?: boolean;
};

/** A4 portrait inside the 6mm @page margin used by every dashboard print. */
const PAGE_W_MM = 198;
const PAGE_H_MM = 284;
const PX_PER_MM = 96 / 25.4;
const FOOTER_PX = 16;
const AVAILABLE_PX = PAGE_H_MM * PX_PER_MM - FOOTER_PX - 3;
/** Shrink a sheet at most this much to pull the next record onto it. */
const MIN_ZOOM = 0.85;
/** Enlarge a sheet at most this much to fill the space left at the bottom. */
const MAX_ZOOM = 1.12;

type Sheet = { blocks: number[]; zoom: number; oversize?: boolean };

const PAGINATOR_CSS = `
  .pp-measure { width: ${PAGE_W_MM}mm; margin: 0 auto; }
  .pp-block { display: flow-root; }
  .pp-page { width: ${PAGE_W_MM}mm; height: ${PAGE_H_MM}mm; position: relative; margin: 0 auto 14px; outline: 1px solid #999; background: #fff; overflow: hidden; }
  .pp-page.pp-oversize { height: auto; min-height: ${PAGE_H_MM}mm; overflow: visible; padding-bottom: ${FOOTER_PX}px; }
  .pp-inner { transform-origin: top left; }
  .pp-foot { position: absolute; left: 0; right: 0; bottom: 0; height: ${FOOTER_PX - 2}px; border-top: 1px solid #000; font-size: 9px; font-weight: 700; display: flex; justify-content: space-between; align-items: center; padding: 0 2px; }
  @media print {
    .pp-page { margin: 0; outline: none; break-after: page; page-break-after: always; }
    .pp-page:last-child { break-after: auto; page-break-after: auto; }
  }
`;

function buildSheets(heights: number[], blocks: PrintBlock[]): Sheet[] {
  const sheets: Sheet[] = [];
  const sumOf = (idx: number[]) => idx.reduce((s, i) => s + heights[i], 0);
  const close = (idx: number[], isLast: boolean) => {
    const sum = sumOf(idx);
    const fit = sum > 0 ? AVAILABLE_PX / sum : 1;
    const zoom = isLast ? Math.min(1, fit) : Math.min(MAX_ZOOM, fit > 1 ? fit * 0.985 : fit);
    sheets.push({ blocks: idx, zoom: Math.max(0.5, zoom) });
  };

  let cur: number[] = [];
  for (let i = 0; i < heights.length; i++) {
    if (cur.length && (sumOf(cur) + heights[i]) * MIN_ZOOM > AVAILABLE_PX) {
      const carry: number[] = [];
      while (cur.length > 1 && blocks[cur[cur.length - 1]].keepWithNext) carry.unshift(cur.pop()!);
      close(cur, false);
      cur = carry;
    }
    cur.push(i);
  }
  if (cur.length) close(cur, true);
  return sheets;
}

function markReady(ready: boolean) {
  if (ready) document.documentElement.dataset.printReady = "1";
  else delete document.documentElement.dataset.printReady;
}

/** Waits until the paginator has laid out its sheets, then prints. */
export function printWhenReady(timeoutMs = 4000) {
  const start = Date.now();
  const tick = () => {
    if (document.documentElement.dataset.printReady === "1" || Date.now() - start > timeoutMs) {
      window.print();
      return;
    }
    setTimeout(tick, 100);
  };
  setTimeout(tick, 150);
}

export default function PrintPaginator({ blocks, footerLabel }: { blocks: PrintBlock[]; footerLabel?: string }) {
  const measureRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const fixPasses = useRef(0);
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const signature = blocks.map((b) => b.key).join("|");
  const lastSignature = useRef(signature);

  useEffect(() => {
    if (lastSignature.current === signature) return;
    lastSignature.current = signature;
    markReady(false);
    fixPasses.current = 0;
    setSheets(null);
  }, [signature]);

  useLayoutEffect(() => {
    if (sheets) return;
    let cancelled = false;
    const measure = () => {
      const root = measureRef.current;
      if (cancelled || !root) return;
      const heights = Array.from(root.children).map((el) => (el as HTMLElement).getBoundingClientRect().height);
      setSheets(buildSheets(heights, blocks));
    };
    if (document.fonts?.ready) void document.fonts.ready.then(measure);
    else measure();
    return () => {
      cancelled = true;
    };
  }, [sheets, blocks]);

  const sheetsRef = useRef<Sheet[] | null>(null);
  sheetsRef.current = sheets;

  /** Shrinks any sheet whose content overflows; returns null when every sheet already fits. */
  const shrinkOverflowing = useCallback((current: Sheet[]): Sheet[] | null => {
    let changed = false;
    const next = current.map((sheet, i) => {
      const inner = pageRefs.current[i];
      if (!inner || sheet.oversize) return sheet;
      const visual = inner.offsetHeight * sheet.zoom;
      if (visual <= AVAILABLE_PX + 0.5) return sheet;
      changed = true;
      if (sheet.zoom <= 0.5) return { ...sheet, oversize: true };
      return { ...sheet, zoom: Math.max(0.5, sheet.zoom * (AVAILABLE_PX / visual) * 0.99) };
    });
    return changed ? next : null;
  }, []);

  useLayoutEffect(() => {
    if (!sheets) return;
    const next = shrinkOverflowing(sheets);
    if (next && fixPasses.current < 8) {
      fixPasses.current += 1;
      setSheets(next);
      return;
    }
    markReady(true);
  }, [sheets, shrinkOverflowing]);

  // Late-loading glyphs (✂, ₹ fallbacks) can grow lines after the first fit — re-check, and once more before printing.
  useEffect(() => {
    if (!sheets) return;
    const recheck = () => {
      const current = sheetsRef.current;
      const next = current && shrinkOverflowing(current);
      if (!next) return;
      markReady(false);
      fixPasses.current = 0;
      flushSync(() => setSheets(next));
    };
    const timers = [setTimeout(recheck, 300), setTimeout(recheck, 1200)];
    window.addEventListener("beforeprint", recheck);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener("beforeprint", recheck);
    };
  }, [sheets, shrinkOverflowing]);

  useEffect(() => () => markReady(false), []);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PAGINATOR_CSS }} />
      {!sheets ? (
        <div ref={measureRef} className="pp-measure">
          {blocks.map((b) => (
            <div key={b.key} className="pp-block">{b.node}</div>
          ))}
        </div>
      ) : (
        sheets.map((sheet, n) => (
          <div key={n} className={`pp-page${sheet.oversize ? " pp-oversize" : ""}`}>
            <div
              ref={(el) => {
                pageRefs.current[n] = el;
              }}
              className="pp-inner"
              style={
                sheet.oversize
                  ? undefined
                  : { transform: `scale(${sheet.zoom})`, width: `${PAGE_W_MM / sheet.zoom}mm` }
              }
            >
              {sheet.blocks.map((i) => (
                <div key={blocks[i].key} className="pp-block">{blocks[i].node}</div>
              ))}
            </div>
            <div className="pp-foot">
              <span>{footerLabel || ""}</span>
              <span>Page {n + 1} of {sheets.length}</span>
            </div>
          </div>
        ))
      )}
    </>
  );
}

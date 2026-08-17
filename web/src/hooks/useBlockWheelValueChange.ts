"use client";

import { useEffect } from "react";
import { blockWheelOnValueFields } from "@/lib/preventInputWheel";

/**
 * Prevents mouse-wheel / trackpad from changing number, date, time, and select values.
 * Use without a ref to cover the whole document (delivery, return, booking, etc.).
 */
export function useBlockWheelValueChange(containerRef?: { current: HTMLElement | null }) {
  useEffect(() => {
    const root: HTMLElement | Document = containerRef?.current ?? document;

    function onWheel(e: WheelEvent) {
      blockWheelOnValueFields(e);
    }

    root.addEventListener("wheel", onWheel, { capture: true, passive: false });
    return () => root.removeEventListener("wheel", onWheel, { capture: true });
  }, [containerRef]);
}

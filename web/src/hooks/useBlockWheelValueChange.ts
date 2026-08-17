"use client";

import { useEffect, type RefObject } from "react";

/**
 * Prevents mouse-wheel from changing number fields or time-picker values
 * while the pointer is over those inputs.
 */
export function useBlockWheelValueChange(containerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    function onWheel(e: WheelEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(".booking-time-dropdown") || target.closest(".dress-picker-scroll") || target.closest(".dress-suggest-dropdown")) {
        return;
      }
      const input = target.closest("input");
      if (!input) return;
      const type = (input as HTMLInputElement).type;
      const isTimeField = Boolean(input.closest(".booking-time-select"));
      if (type !== "number" && !isTimeField) return;
      e.preventDefault();
      input.blur();
    }

    root.addEventListener("wheel", onWheel, { passive: false });
    return () => root.removeEventListener("wheel", onWheel);
  }, [containerRef]);
}

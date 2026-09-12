/**
 * Distinguish a tap from a scroll/drag so list rows don't select while scrolling.
 */
export const TAP_MOVE_THRESHOLD_PX = 12;

export type TapGuard = {
  onPointerDown: (e: { clientX: number; clientY: number }) => void;
  onPointerMove: (e: { clientX: number; clientY: number }) => void;
  /** Returns true when the gesture was a tap (not a drag). */
  endAsTap: () => boolean;
  reset: () => void;
};

export function createTapGuard(thresholdPx = TAP_MOVE_THRESHOLD_PX): TapGuard {
  let originX = 0;
  let originY = 0;
  let tracking = false;
  let moved = false;

  return {
    onPointerDown(e) {
      tracking = true;
      moved = false;
      originX = e.clientX;
      originY = e.clientY;
    },
    onPointerMove(e) {
      if (!tracking || moved) return;
      const dx = e.clientX - originX;
      const dy = e.clientY - originY;
      if (dx * dx + dy * dy > thresholdPx * thresholdPx) moved = true;
    },
    endAsTap() {
      const wasTap = tracking && !moved;
      tracking = false;
      moved = false;
      return wasTap;
    },
    reset() {
      tracking = false;
      moved = false;
    },
  };
}

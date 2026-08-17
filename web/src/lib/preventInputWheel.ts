const WHEEL_SENSITIVE_INPUT_TYPES = new Set([
  "number",
  "date",
  "datetime-local",
  "time",
  "month",
  "week",
]);

function isScrollableList(el: Element): boolean {
  return Boolean(
    el.closest(".booking-time-dropdown") ||
      el.closest(".dress-picker-scroll") ||
      el.closest(".dress-suggest-dropdown"),
  );
}

/** Number, date, time, and native select values must not change on wheel/trackpad. */
export function wheelSensitiveControl(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element) || isScrollableList(target)) return null;
  const control = target.closest("input, select");
  if (control instanceof HTMLSelectElement) return control;
  if (!(control instanceof HTMLInputElement)) return null;
  if (WHEEL_SENSITIVE_INPUT_TYPES.has(control.type)) return control;
  if (control.closest(".booking-time-select") || control.closest(".typeable-date-input")) {
    return control;
  }
  return null;
}

/** Stop mouse-wheel from spinning focused number inputs (React onWheel fallback). */
export function preventInputWheel(e: {
  currentTarget: { blur: () => void };
  preventDefault?: () => void;
}): void {
  e.preventDefault?.();
  e.currentTarget.blur();
}

export function blockWheelOnValueFields(e: WheelEvent): void {
  const control = wheelSensitiveControl(e.target);
  if (!control) return;
  e.preventDefault();
  if (document.activeElement === control) {
    control.blur();
  }
}

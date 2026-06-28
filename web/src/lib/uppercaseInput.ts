/** Fields that should keep typed casing (dates, passwords, numbers, etc.). */
export function shouldUppercaseInput(el: Element): boolean {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
    return false;
  }
  if (el.closest(".typeable-date-input")) return false;
  if (el.closest("[data-preserve-case]")) return false;
  if (el.classList.contains("preserve-case")) return false;

  if (el instanceof HTMLInputElement) {
    const type = el.type.toLowerCase();
    if (
      [
        "password",
        "number",
        "email",
        "date",
        "datetime-local",
        "time",
        "month",
        "week",
        "url",
        "hidden",
        "file",
        "color",
        "range",
      ].includes(type)
    ) {
      return false;
    }
    if (el.inputMode === "numeric" || el.inputMode === "decimal") return false;
  }

  return true;
}

/** Uppercase a controlled or uncontrolled input and notify React. */
export function uppercaseInputElement(el: HTMLInputElement | HTMLTextAreaElement): void {
  const upper = el.value.toUpperCase();
  if (el.value === upper) return;

  const start = el.selectionStart;
  const end = el.selectionEnd;

  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) {
    setter.call(el, upper);
  } else {
    el.value = upper;
  }

  el.dispatchEvent(new Event("input", { bubbles: true }));

  if (start !== null && end !== null) {
    try {
      el.setSelectionRange(start, end);
    } catch {
      /* ignore for unsupported input types */
    }
  }
}

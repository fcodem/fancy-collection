/** Stop mouse-wheel from spinning focused number inputs. */
export function preventInputWheel(
  e: { currentTarget: { blur: () => void } },
): void {
  e.currentTarget.blur();
}

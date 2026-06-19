function digitSum(n: number): number {
  return String(n).split("").reduce((s, d) => s + parseInt(d, 10), 0);
}

export function isUnluckySerial(n: number): boolean {
  const sum = digitSum(n);
  return sum === 4 || sum === 8;
}

export function nextValidSerial(start: number): number {
  let n = start;
  while (isUnluckySerial(n)) n += 1;
  return n;
}

export function serialPositionToValue(pos: number): number {
  let count = 0;
  let n = 1;
  while (true) {
    if (!isUnluckySerial(n)) {
      count += 1;
      if (count === pos) return n;
    }
    n += 1;
  }
}

export async function generateNumber(
  prefix: string,
  findLast: (pattern: string) => Promise<string | null>
): Promise<string> {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const pattern = `${prefix}-${today}-`;
  const last = await findLast(`${pattern}%`);
  let count = 1;
  if (last) {
    const parts = last.split("-");
    count = parseInt(parts[parts.length - 1], 10) + 1;
  }
  return `${prefix}-${today}-${String(count).padStart(3, "0")}`;
}

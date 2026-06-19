import sharp from "sharp";

/** Average-hash (aHash) matching Flask PIL implementation: 16×16, threshold vs mean. */
export async function computeAverageHash(buffer: Buffer): Promise<bigint> {
  const { data } = await sharp(buffer)
    .resize(16, 16, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels: number[] = [];
  for (let i = 0; i < data.length; i += 3) {
    pixels.push((data[i] + data[i + 1] + data[i + 2]) / 3);
  }
  const avg = pixels.reduce((s, p) => s + p, 0) / pixels.length;
  let hash = BigInt(0);
  for (let i = 0; i < pixels.length; i++) {
    if (pixels[i] >= avg) hash |= BigInt(1) << BigInt(i);
  }
  return hash;
}

export function hashSimilarity(a: bigint, b: bigint): number {
  const xor = a ^ b;
  let diff = 0;
  let x = xor;
  while (x > BigInt(0)) {
    diff += Number(x & BigInt(1));
    x >>= BigInt(1);
  }
  return Math.round(((256 - diff) / 256) * 1000) / 10;
}

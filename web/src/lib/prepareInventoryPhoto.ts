import { compressImageForUpload } from "@/lib/clientImageCompress";

export type PreparedInventoryPhoto = {
  file: File;
  thumbnail: File;
  hash: string;
  sourceKey: string;
};

async function hashFile(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function makeThumbnail(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 320 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image canvas unavailable");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) => value ? resolve(value) : reject(new Error("Thumbnail failed")),
        "image/webp",
        0.72,
      ),
    );
    return new File([blob], `${file.name.replace(/\.\w+$/, "")}-thumb.webp`, {
      type: "image/webp",
      lastModified: Date.now(),
    });
  } finally {
    bitmap.close();
  }
}

async function fallback(file: File, sourceKey: string): Promise<PreparedInventoryPhoto> {
  const compressed = await compressImageForUpload(file);
  const [thumbnail, hash] = await Promise.all([
    makeThumbnail(compressed),
    hashFile(compressed),
  ]);
  return { file: compressed, thumbnail, hash, sourceKey };
}

export function prepareInventoryPhoto(
  file: File,
  sourceKey: string,
): Promise<PreparedInventoryPhoto> {
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") {
    return fallback(file, sourceKey);
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker("/inventory-photo-worker.js");
    const timeout = window.setTimeout(() => {
      worker.terminate();
      void fallback(file, sourceKey).then(resolve, reject);
    }, 20_000);
    worker.onmessage = (event: MessageEvent<{
      ok: boolean;
      original?: Blob;
      thumbnail?: Blob;
      hash?: string;
      error?: string;
    }>) => {
      window.clearTimeout(timeout);
      worker.terminate();
      if (!event.data.ok || !event.data.original || !event.data.thumbnail || !event.data.hash) {
        void fallback(file, sourceKey).then(resolve, reject);
        return;
      }
      resolve({
        file: new File(
          [event.data.original],
          `${file.name.replace(/\.\w+$/, "")}.jpg`,
          { type: "image/jpeg", lastModified: Date.now() },
        ),
        thumbnail: new File(
          [event.data.thumbnail],
          `${file.name.replace(/\.\w+$/, "")}-thumb.webp`,
          { type: "image/webp", lastModified: Date.now() },
        ),
        hash: event.data.hash,
        sourceKey,
      });
    };
    worker.onerror = () => {
      window.clearTimeout(timeout);
      worker.terminate();
      void fallback(file, sourceKey).then(resolve, reject);
    };
    worker.postMessage({ file, sourceKey });
  });
}

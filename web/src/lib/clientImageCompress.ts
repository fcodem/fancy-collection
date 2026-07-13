/** Browser-side image resize/compress before multipart upload (avoids Vercel 4.5MB body limit). */

const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.72;
const MAX_OUTPUT_BYTES = 1.2 * 1024 * 1024;

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read the selected photo."));
    };
    img.src = url;
  });
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not compress photo."))),
      "image/jpeg",
      quality,
    );
  });
}

/**
 * Compress a phone/camera photo for upload. Returns the original file if already small
 * or if compression fails (caller can still attempt upload).
 */
export async function compressImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/") && !/\.(jpe?g|png|webp|gif)$/i.test(file.name)) {
    return file;
  }
  // Always compress images before upload (phone JPEGs blow Vercel's body limit / memory).
  if (file.size > 0 && file.size <= 250_000 && /\.jpe?g$/i.test(file.name)) return file;

  try {
    const img = await loadImageFromFile(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, width, height);

    let quality = JPEG_QUALITY;
    let blob = await canvasToJpegBlob(canvas, quality);
    while (blob.size > MAX_OUTPUT_BYTES && quality > 0.5) {
      quality -= 0.1;
      blob = await canvasToJpegBlob(canvas, quality);
    }

    const base = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}

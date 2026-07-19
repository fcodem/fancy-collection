self.onmessage = async (event) => {
  const { file, sourceKey } = event.data || {};
  try {
    if (!(file instanceof Blob)) throw new Error("Invalid image");
    const bitmap = await createImageBitmap(file);
    const render = async (maxEdge, type, quality) => {
      const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Image canvas unavailable");
      context.drawImage(bitmap, 0, 0, width, height);
      return canvas.convertToBlob({ type, quality });
    };
    const [original, thumbnail] = await Promise.all([
      render(720, "image/jpeg", 0.55),
      render(180, "image/webp", 0.55),
    ]);
    bitmap.close();
    const hashBuffer = await crypto.subtle.digest("SHA-256", await original.arrayBuffer());
    const hash = Array.from(new Uint8Array(hashBuffer))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    self.postMessage({ ok: true, sourceKey, original, thumbnail, hash });
  } catch (error) {
    self.postMessage({
      ok: false,
      sourceKey,
      error: error instanceof Error ? error.message : "Image preparation failed",
    });
  }
};

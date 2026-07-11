"use client";

import ZoomableImage from "@/components/ZoomableImage";

export default function InventoryDetailPhoto({
  src,
  alt,
}: {
  src: string;
  alt: string;
}) {
  return (
    <ZoomableImage
      src={src}
      alt={alt}
      className="inv-detail-photo-img"
      overlayCaption={alt}
      style={{ border: "1px solid #e5e5e5", maxWidth: "100%" }}
    />
  );
}

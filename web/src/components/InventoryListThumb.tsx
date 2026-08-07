"use client";

import ZoomableImage from "@/components/ZoomableImage";

export default function InventoryListThumb({
  src,
  fullSrc,
  caption,
}: {
  src: string;
  fullSrc?: string | null;
  caption?: string;
}) {
  return (
    <ZoomableImage
      src={src}
      fullSrc={fullSrc || src}
      alt=""
      className="inv-list-thumb"
      overlayCaption={caption}
    />
  );
}

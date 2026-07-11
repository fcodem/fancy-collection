"use client";

import ZoomableImage from "@/components/ZoomableImage";

export default function InventoryListThumb({
  src,
  caption,
}: {
  src: string;
  caption?: string;
}) {
  return (
    <ZoomableImage
      src={src}
      alt=""
      className="inv-list-thumb"
      overlayCaption={caption}
    />
  );
}

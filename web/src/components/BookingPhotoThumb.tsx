"use client";

import { useState } from "react";
import ZoomableImage from "@/components/ZoomableImage";
import { photoUrl } from "@/lib/photoUrl";

type Props = {
  photo?: string | null;
  size?: number;
  alt?: string;
  className?: string;
  /** @deprecated Zoom is built-in via ZoomableImage; kept for call-site compatibility. */
  onZoom?: (src: string) => void;
};

/**
 * Booking dress thumbnail — stable size on tablet, broken-image fallback, click to zoom.
 */
export default function BookingPhotoThumb({
  photo,
  size = 56,
  alt = "",
  className = "",
}: Props) {
  const [broken, setBroken] = useState(false);
  const src = photoUrl(photo);

  if (!src || broken) {
    return (
      <div
        className={`booking-photo-thumb booking-photo-thumb-empty ${className}`.trim()}
        style={{ width: size, height: size, minWidth: size, minHeight: size }}
        aria-hidden
      >
        👗
      </div>
    );
  }

  return (
    <ZoomableImage
      src={src}
      alt={alt}
      overlayCaption={alt || undefined}
      width={size}
      height={size}
      loading="eager"
      decoding="async"
      className={`booking-photo-thumb booking-photo-thumb-zoomable ${className}`.trim()}
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        objectFit: "cover",
        borderRadius: 8,
      }}
      onError={() => setBroken(true)}
    />
  );
}

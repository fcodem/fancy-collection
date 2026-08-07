import type { CSSProperties, ReactNode } from "react";
import { BRAND_NAME, BRAND_OWNER } from "@/lib/branding";
import ZoomableImage from "@/components/ZoomableImage";

/**
 * Customer-facing dress photo with a large diagonal brand watermark.
 * Used on booking / delivery / return slips (WhatsApp PDF via Puppeteer).
 */
export default function SlipOutfitPhoto({
  src,
  alt,
  caption,
  imgStyle,
  children,
}: {
  src: string;
  alt: string;
  caption?: string;
  imgStyle?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <div
      className="slip-outfit-photo"
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        maxWidth: "100%",
        overflow: "hidden",
      }}
    >
      <ZoomableImage src={src} alt={alt} overlayCaption={caption || alt} style={imgStyle} />
      <div
        className="slip-outfit-watermark"
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          zIndex: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            transform: "rotate(-28deg)",
            textAlign: "center",
            lineHeight: 1.15,
            color: "rgba(255,255,255,0.42)",
            textShadow:
              "0 1px 2px rgba(0,0,0,0.55), 0 0 1px rgba(0,0,0,0.8), 1px 1px 0 rgba(0,0,0,0.35)",
            fontWeight: 900,
            letterSpacing: "0.06em",
            userSelect: "none",
            width: "140%",
          }}
        >
          <div
            style={{
              fontSize: "clamp(18px, 5.5vw, 42px)",
              fontFamily: "Georgia, 'Times New Roman', serif",
              textTransform: "uppercase",
            }}
          >
            {BRAND_NAME}
          </div>
          <div
            style={{
              fontSize: "clamp(12px, 3.2vw, 22px)",
              fontFamily: "system-ui, sans-serif",
              fontWeight: 800,
              marginTop: 4,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            by {BRAND_OWNER}
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

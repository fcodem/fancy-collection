import type { CSSProperties } from "react";
import {
  BRAND_APP_SUBTITLE,
  BRAND_APP_TITLE,
  BRAND_FULL_NAME,
  BRAND_LOGIN_IMAGE_PATH,
  BRAND_LOGO_PATH,
  BRAND_MOTTO,
  BRAND_SINCE,
  BRAND_STAFF_LOGIN_HINT,
} from "@/lib/branding";
import { SLIP_GOLD, SLIP_GREEN } from "@/lib/slipConstants";

type BrandLogoProps = {
  size?: number;
  style?: CSSProperties;
  className?: string;
};

/** Circular logo for sidebar, slips, and compact headers. */
export function BrandLogo({ size = 52, style, className }: BrandLogoProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={BRAND_LOGO_PATH}
      alt={BRAND_APP_TITLE}
      width={size}
      height={size}
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        objectFit: "cover",
        display: "block",
        border: `2px solid ${SLIP_GOLD}`,
        background: "#fff",
        boxShadow: "0 4px 14px rgba(201,168,76,0.35)",
        ...style,
      }}
    />
  );
}

/** Sidebar brand block with logo and company name. */
export function SidebarBrandMark() {
  return (
    <div className="sidebar-brand">
      <div className="brand-icon brand-icon-logo">
        <BrandLogo size={52} style={{ margin: 0, boxShadow: "none" }} />
      </div>
      <h1 className="sidebar-brand-text brand-title-main">{BRAND_APP_TITLE}</h1>
      <div className="sidebar-brand-text brand-title-since">{BRAND_SINCE}</div>
      <div className="sidebar-brand-text brand-title-motto">{BRAND_MOTTO}</div>
      <span className="sidebar-brand-text brand-title-sub">{BRAND_APP_SUBTITLE}</span>
    </div>
  );
}

/** Login / auth screens — large primary brand lockup only (no variant sheet). */
export function LoginBrandMark() {
  return (
    <div className="login-brand">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={BRAND_LOGIN_IMAGE_PATH}
        alt={BRAND_FULL_NAME}
        className="login-brand-image"
      />
      <div className="login-brand-motto">{BRAND_MOTTO}</div>
      <p className="login-brand-hint">{BRAND_STAFF_LOGIN_HINT}</p>
    </div>
  );
}

/** Compact inline motto pill for headers. */
export function BrandMottoPill({ dark = true, style }: { dark?: boolean; style?: CSSProperties }) {
  const parts = BRAND_MOTTO.split("|").map((p) => p.trim());
  return (
    <span
      className="brand-motto-pill"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0,
        padding: "3px 10px",
        borderRadius: 999,
        border: `1.5px solid ${SLIP_GOLD}`,
        background: dark
          ? "linear-gradient(90deg, rgba(201,168,76,0.25), rgba(255,255,255,0.08), rgba(201,168,76,0.25))"
          : "linear-gradient(90deg, #fff8e1, #fffef8, #fff8e1)",
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: "0.14em",
        color: dark ? SLIP_GOLD : SLIP_GREEN,
        textTransform: "uppercase",
        ...style,
      }}
    >
      {parts.map((word, i) => (
        <span key={word} style={{ display: "inline-flex", alignItems: "center" }}>
          {i > 0 && <span style={{ padding: "0 5px", opacity: 0.7, fontWeight: 400 }}>|</span>}
          {word}
        </span>
      ))}
    </span>
  );
}

export function BrandBreadcrumbLabel() {
  return (
    <span className="brand-breadcrumb">
      <span className="brand-breadcrumb-name">{BRAND_APP_TITLE}</span>
      <span className="brand-breadcrumb-dot"> · </span>
      <span className="brand-breadcrumb-since">{BRAND_SINCE}</span>
    </span>
  );
}

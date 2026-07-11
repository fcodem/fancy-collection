import Link from "next/link";
import { BrandLogo } from "@/components/BrandMark";
import { BRAND_APP_TITLE } from "@/lib/branding";

export default function NotFound() {
  return (
    <div className="login-page">
      <div className="card login-card">
        <div className="login-brand">
          <BrandLogo size={56} style={{ margin: "0 auto 12px" }} />
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--primary)", marginBottom: 8 }}>{BRAND_APP_TITLE}</div>
          <div className="brand-icon" style={{ margin: "0 auto 12px", width: 48, height: 48, fontSize: 18 }}>404</div>
          <h1>Page not found</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            This page does not exist or has been moved.
          </p>
        </div>
        <Link href="/" className="btn btn-primary btn-block"
          style={{ textAlign: "center" }}>
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}

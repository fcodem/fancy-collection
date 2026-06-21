import Link from "next/link";

export default function NotFound() {
  return (
    <div className="login-page">
      <div className="card login-card">
        <div className="login-brand">
          <div className="brand-icon">404</div>
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

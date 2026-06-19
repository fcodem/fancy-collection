import Link from "next/link";
import { loginAction } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="brand-icon" style={{ fontSize: 48 }}>
            👑
          </div>
          <h1>Fancy Collection</h1>
          <p>Rental Management System</p>
        </div>
        {params.error ? (
          <div className="alert alert-error">
            <i className="fa-solid fa-circle-xmark" /> Invalid username or password.
          </div>
        ) : null}
        <form action={loginAction} method="post">
          <div className="form-group">
            <label>Username</label>
            <input type="text" name="username" className="form-control" required autoFocus />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input type="password" name="password" className="form-control" required />
          </div>
          <button type="submit" className="btn btn-primary btn-block">
            <i className="fa-solid fa-right-to-bracket" /> Sign In
          </button>
        </form>
        <p style={{ marginTop: 16, fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
          Staff logins require owner approval.
        </p>
      </div>
    </div>
  );
}

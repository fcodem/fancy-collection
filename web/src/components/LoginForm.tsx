"use client";

import { FormEvent, useState } from "react";

type LoginResponse = {
  ok?: boolean;
  error?: string;
  redirect?: string;
  pending?: boolean;
};

export default function LoginForm({ initialError }: { initialError?: string }) {
  const [error, setError] = useState(initialError);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(undefined);
    setPending(true);

    const form = e.currentTarget;
    const formData = new FormData(form);
    const username = String(formData.get("username") || "").trim();
    const password = String(formData.get("password") || "");

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ username, password }),
      });

      let data: LoginResponse = {};
      try {
        data = (await res.json()) as LoginResponse;
      } catch {
        setError("Login failed. The server returned an invalid response.");
        return;
      }

      if (!res.ok) {
        setError(data.error || "Invalid username or password.");
        return;
      }

      window.location.href = data.redirect || "/";
    } catch {
      setError("Login failed. Please check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card card">
        <div className="login-brand">
          <div className="brand-icon">👑</div>
          <h1>Fancy Collection</h1>
          <p>Premium rental management</p>
        </div>
        <form onSubmit={handleSubmit} suppressHydrationWarning>
          {error && (
            <div className="alert alert-error" role="alert">
              <i className="fa-solid fa-circle-xmark" style={{ marginRight: 8 }} />
              {error}
            </div>
          )}
          <div className="form-group">
            <label htmlFor="login-username">Username</label>
            <div className="input-icon-wrap">
              <i className="fa-solid fa-user" aria-hidden />
              <input
                id="login-username"
                name="username"
                className="form-control"
                required
                autoFocus
                autoComplete="username"
                placeholder="Enter username"
                suppressHydrationWarning
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="login-password">Password</label>
            <div className="input-icon-wrap">
              <i className="fa-solid fa-lock" aria-hidden />
              <input
                id="login-password"
                name="password"
                type="password"
                className="form-control"
                required
                autoComplete="current-password"
                placeholder="Enter password"
                suppressHydrationWarning
              />
            </div>
          </div>
          <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={pending}>
            {pending ? (
              <>
                <span className="spinner spinner-inline" /> Signing in…
              </>
            ) : (
              <>
                <i className="fa-solid fa-right-to-bracket" style={{ marginRight: 8 }} /> Sign In
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

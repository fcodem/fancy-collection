"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function LoginPending() {
  const searchParams = useSearchParams();
  const urlToken = searchParams.get("t") || "";
  const [statusMsg, setStatusMsg] = useState("Waiting for owner approval…");
  const [pollToken, setPollToken] = useState(urlToken);

  useEffect(() => {
    if (urlToken) {
      sessionStorage.setItem("fc_pending_login_token", urlToken);
      setPollToken(urlToken);
      return;
    }
    setPollToken(sessionStorage.getItem("fc_pending_login_token") || "");
  }, [urlToken]);

  useEffect(() => {
    if (!pollToken) {
      setStatusMsg("Session expired. Please sign in again.");
      return;
    }

    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(
          `/api/login-request/status?t=${encodeURIComponent(pollToken)}`,
          { credentials: "same-origin", cache: "no-store" }
        );
        const data = await res.json();
        if (cancelled) return;

        if (data.status === "approved") {
          sessionStorage.removeItem("fc_pending_login_token");
          window.location.href = data.redirect || "/";
          return;
        }
        if (data.status === "rejected") {
          sessionStorage.removeItem("fc_pending_login_token");
          setStatusMsg("Login was denied by the owner.");
          return;
        }
        if (data.status === "expired") {
          sessionStorage.removeItem("fc_pending_login_token");
          setStatusMsg("Request expired. Please sign in again.");
          return;
        }
        if (data.status === "none") {
          setStatusMsg("Could not verify your request. Please sign in again.");
          return;
        }
        setStatusMsg("Waiting for owner approval…");
      } catch {
        if (!cancelled) setStatusMsg("Connection error. Retrying…");
      }
    }

    void poll();
    const timer = setInterval(poll, 2500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pollToken]);

  return (
    <div className="login-page">
      <div className="login-card card" style={{ textAlign: "center" }}>
        <div className="brand-icon" style={{ margin: "0 auto 16px" }}>⏳</div>
        <h2>Waiting for Owner Approval</h2>
        <p style={{ color: "var(--text-muted)", marginTop: 12 }}>
          Your login request has been sent. Please wait while the owner approves your access.
        </p>
        <p style={{ fontSize: 13, marginTop: 8 }}>{statusMsg}</p>
        <div className="spinner" style={{ margin: "24px auto" }} />
        <a href="/login" className="btn btn-outline" style={{ marginTop: 16 }}>
          Back to Login
        </a>
      </div>
    </div>
  );
}

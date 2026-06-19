"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LoginPendingPage() {
  const router = useRouter();

  useEffect(() => {
    const poll = setInterval(async () => {
      const res = await fetch("/api/login-request/status");
      if (!res.ok) return;
      const data = await res.json();
      if (data.status === "approved") {
        router.push(data.redirect || "/");
        router.refresh();
      } else if (data.status === "rejected" || data.status === "expired") {
        router.push("/login?error=1");
      }
    }, 3000);
    return () => clearInterval(poll);
  }, [router]);

  return (
    <div className="login-page">
      <div className="login-card" style={{ textAlign: "center" }}>
        <div className="spinner" style={{ margin: "20px auto" }} />
        <h2>Waiting for Owner Approval</h2>
        <p style={{ color: "var(--text-muted)" }}>
          Your login request was sent to the owner. This page will update automatically.
        </p>
        <a href="/login" className="btn btn-outline" style={{ marginTop: 16 }}>
          Back to Login
        </a>
      </div>
    </div>
  );
}

import { Suspense } from "react";
import LoginPending from "@/components/LoginPending";

export default function LoginPendingPage() {
  return (
    <Suspense fallback={<div className="login-page"><div className="login-card card" style={{ textAlign: "center", padding: 32 }}>Loading…</div></div>}>
      <LoginPending />
    </Suspense>
  );
}

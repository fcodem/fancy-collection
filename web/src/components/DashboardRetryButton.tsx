"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export default function DashboardRetryButton({ onRetry }: { onRetry?: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="btn btn-sm btn-outline"
      disabled={pending}
      onClick={() => {
        onRetry?.();
        startTransition(() => router.refresh());
      }}
    >
      {pending ? "Retrying…" : "Retry"}
    </button>
  );
}

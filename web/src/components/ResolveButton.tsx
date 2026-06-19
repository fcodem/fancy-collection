"use client";

import { useRouter } from "next/navigation";

export default function ResolveButton({ bookingId }: { bookingId: number }) {
  const router = useRouter();
  return (
    <button
      className="btn btn-sm btn-primary"
      onClick={async () => {
        await fetch(`/api/incomplete-return/${bookingId}/resolve`, { method: "POST" });
        router.refresh();
      }}
    >
      Resolve
    </button>
  );
}

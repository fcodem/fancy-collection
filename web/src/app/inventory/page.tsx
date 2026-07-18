import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUserForLayout, isOwner } from "@/lib/auth";
import { listInventoryGroups } from "@/lib/services/inventoryList";
import InventoryListClient from "@/components/InventoryListClient";
import { createPerfTimer } from "@/lib/perfTiming";

export const dynamic = "force-dynamic";

function InventoryListFallback() {
  return (
    <div className="card" style={{ padding: 24 }}>
      <div
        style={{
          height: 24,
          width: 180,
          background: "var(--border-color)",
          borderRadius: 4,
          marginBottom: 16,
          opacity: 0.4,
        }}
      />
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} style={{ display: "flex", gap: 12, marginBottom: 8 }}>
          <div
            style={{
              height: 40,
              width: 40,
              background: "var(--border-color)",
              borderRadius: 4,
              opacity: 0.25,
              flexShrink: 0,
            }}
          />
          <div
            style={{
              flex: 1,
              height: 40,
              background: "var(--border-color)",
              borderRadius: 4,
              opacity: 0.2,
            }}
          />
        </div>
      ))}
    </div>
  );
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; status?: string }>;
}) {
  const perf = createPerfTimer("GET /inventory");
  perf.mark("auth");
  const user = await getCurrentUserForLayout();
  perf.endStage("authMs", "auth");
  if (!user) redirect("/login");

  const sp = await searchParams;
  const q = sp.q?.trim() || "";
  const category = sp.category || "";
  const status = sp.status || "";
  // First page: 40 desktop default; client may request 20 on mobile via API
  const pageSize = 40;

  perf.mark("query");
  const result = await listInventoryGroups({
    q,
    category,
    status,
    limit: pageSize,
    sort: "name",
  });
  perf.endStage("queryMs", "query");
  perf.setItemCount(result.rowCount);
  perf.finish({ kind: "read" });

  return (
    <Suspense fallback={<InventoryListFallback />}>
      <InventoryListClient
        initialGroups={result.groups}
        initialNextCursor={result.nextCursor}
        initialQ={q}
        initialStatus={status}
        initialCategory={category}
        isOwner={isOwner(user)}
        pageSize={pageSize}
      />
    </Suspense>
  );
}

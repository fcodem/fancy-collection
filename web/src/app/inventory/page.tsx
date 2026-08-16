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

type InventorySearch = {
  q?: string;
  category?: string;
  status?: string;
  sub_category?: string;
  subcategory?: string;
};

async function InventoryListLoader({
  sp,
  isOwnerUser,
}: {
  sp: InventorySearch;
  isOwnerUser: boolean;
}) {
  const perf = createPerfTimer("GET /inventory");
  const q = sp.q?.trim() || "";
  const category = sp.category || "";
  const subCategory = sp.sub_category || sp.subcategory || "";
  const status = sp.status || "";
  const pageSize = 40;

  perf.mark("query");
  const result = await listInventoryGroups({
    q,
    category,
    subCategory,
    status,
    limit: pageSize,
    sort: "name",
  });
  perf.endStage("queryMs", "query");
  perf.setItemCount(result.rowCount);
  perf.finish({ kind: "read" });

  return (
    <InventoryListClient
      initialGroups={result.groups}
      initialNextCursor={result.nextCursor}
      initialQ={q}
      initialStatus={status}
      initialCategory={category}
      initialSubCategory={subCategory}
      isOwner={isOwnerUser}
      pageSize={pageSize}
    />
  );
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<InventorySearch>;
}) {
  const perf = createPerfTimer("GET /inventory");
  perf.mark("auth");
  const user = await getCurrentUserForLayout();
  perf.endStage("authMs", "auth");
  if (!user) redirect("/login");

  const sp = await searchParams;

  return (
    <Suspense fallback={<InventoryListFallback />}>
      <InventoryListLoader sp={sp} isOwnerUser={isOwner(user)} />
    </Suspense>
  );
}

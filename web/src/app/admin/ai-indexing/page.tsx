import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";
import AiIndexingDashboardClient from "@/components/AiIndexingDashboardClient";

export const dynamic = "force-dynamic";

export default async function AiIndexingDashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isOwner(user)) redirect("/");

  return (
    <div className="page-content">
      <h1 className="page-title">AI Indexing Health</h1>
      <p style={{ color: "#666", fontSize: 14, marginTop: -8 }}>
        Enterprise self-healing queue: inventory saves enqueue jobs instantly; the worker indexes
        embeddings + signatures atomically. Only READY profiles are searchable.
      </p>
      <AiIndexingDashboardClient />
    </div>
  );
}

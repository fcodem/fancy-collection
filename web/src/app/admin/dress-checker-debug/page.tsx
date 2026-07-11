import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";
import DressCheckerDebugClient from "@/components/DressCheckerDebugClient";

export const dynamic = "force-dynamic";

export default async function DressCheckerDebugPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isOwner(user)) redirect("/");

  return (
    <div className="page-content">
      <h1 className="page-title">Dress Checker Debug</h1>
      <p style={{ color: "#666", fontSize: 14, marginTop: -8 }}>
        Enterprise pipeline: pgvector top 20 → fine-grained re-rank → GPT-4o verify top 5.
        Inspect detected query features, per-candidate scores, rejected reasons, and download
        diagnostics JSON. Last 100 searches are stored locally.
      </p>
      <DressCheckerDebugClient />
    </div>
  );
}

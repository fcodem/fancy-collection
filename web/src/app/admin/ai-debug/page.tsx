import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";
import AiDebugClient from "@/components/AiDebugClient";

export const dynamic = "force-dynamic";

export default async function AiDebugPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isOwner(user)) redirect("/");

  return (
    <div className="page-content">
      <h1 className="page-title">AI Dress Checker Debug</h1>
      <p style={{ color: "#666", fontSize: 14, marginTop: -8 }}>
        FashionCLIP → SigLIP → OpenCLIP embeddings. pgvector ANN search (top 30) + fine-grained re-rank + OpenAI verification (top 5).
        Use Search on a row to populate Top Matches and scores.
      </p>
      <AiDebugClient />
    </div>
  );
}

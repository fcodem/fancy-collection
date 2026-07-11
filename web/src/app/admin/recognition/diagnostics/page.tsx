import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";
import AiDiagnosticsClient from "@/components/AiDiagnosticsClient";

export const dynamic = "force-dynamic";

export default async function RecognitionDiagnosticsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isOwner(user)) redirect("/");
  return (
    <div className="page-content">
      <h1 className="page-title">AI Diagnostics</h1>
      <AiDiagnosticsClient />
    </div>
  );
}

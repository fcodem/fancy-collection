import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import CatalogGeneratorClient from "@/components/CatalogGeneratorClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "AI Catalog Generator" };

export default async function CatalogGeneratorPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/dashboard");
  return <CatalogGeneratorClient />;
}

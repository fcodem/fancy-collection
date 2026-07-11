import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import AiImageEnhancerClient from "@/components/AiImageEnhancerClient";

export const dynamic = "force-dynamic";

export default async function ImageEnhancerPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <AiImageEnhancerClient />;
}

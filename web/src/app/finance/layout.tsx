import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isOwner(user)) redirect("/");

  return children;
}

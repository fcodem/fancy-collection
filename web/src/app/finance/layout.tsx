import { redirect } from "next/navigation";
import { getCurrentUserForLayout, isOwner } from "@/lib/auth";

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUserForLayout();
  if (!user) redirect("/login");
  if (!isOwner(user)) redirect("/");

  return children;
}

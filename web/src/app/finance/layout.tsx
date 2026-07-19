import { redirect } from "next/navigation";
import { getCurrentUserForLayout, isOwner } from "@/lib/auth";

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  let user;
  try {
    user = await getCurrentUserForLayout();
  } catch {
    redirect("/login");
  }
  if (!user) redirect("/login");
  if (!isOwner(user)) redirect("/");

  return children;
}

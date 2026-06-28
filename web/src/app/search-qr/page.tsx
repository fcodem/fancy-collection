import { redirect, notFound } from "next/navigation";
import SearchQrClient from "@/components/SearchQrClient";
import { getCurrentUser } from "@/lib/auth";

export default async function SearchQrPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <SearchQrClient />
  );
}

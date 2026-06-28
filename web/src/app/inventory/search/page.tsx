import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";
import InventorySearchClient from "@/components/InventorySearchClient";

export default async function InventorySearchPage() {
return (
    <InventorySearchClient />
  );
}

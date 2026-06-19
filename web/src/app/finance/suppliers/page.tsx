import { redirect } from "next/navigation";
import SuppliersClient from "@/components/SuppliersClient";

export default async function SuppliersPage() {
  return <SuppliersClient />;
}

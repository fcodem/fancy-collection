import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";
import ChangePasswordClient from "@/components/ChangePasswordClient";

export default async function ChangePasswordPage() {
return (
    <ChangePasswordClient />
  );
}

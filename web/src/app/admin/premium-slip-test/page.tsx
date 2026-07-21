import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";
import PremiumSlipTestClient from "@/components/PremiumSlipTestClient";

export const dynamic = "force-dynamic";

export default async function PremiumSlipTestPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isOwner(user)) redirect("/");

  return (
    <div className="page-content">
      <h1 className="page-title">Premium Slip Test</h1>
      <p style={{ color: "#666", fontSize: 14, marginTop: -8, maxWidth: 720 }}>
        Owner-only end-to-end verification of all four premium Chromium slips. Rendering never
        contacts Meta unless you explicitly send to an approved test number entered below.
        Customer WhatsApp numbers are never used or stored here.
      </p>
      <PremiumSlipTestClient />
    </div>
  );
}

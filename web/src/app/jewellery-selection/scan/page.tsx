import { redirect } from "next/navigation";
import SearchQrClient from "@/components/SearchQrClient";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function JewellerySelectionScanPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <SearchQrClient
      navigateTarget="jewellery"
      title="Scan QR — Jewellery Selection"
      subtitle="Scan a booking bill QR to open its jewellery selection record"
      backHref="/jewellery-selection"
      backLabel="Jewellery Selection"
    />
  );
}

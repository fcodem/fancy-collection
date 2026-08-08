import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserForLayout } from "@/lib/auth";
import PrintMarginSetupClient from "@/components/PrintMarginSetupClient";

export const dynamic = "force-dynamic";

export default async function PrintMarginsPage() {
  const user = await getCurrentUserForLayout();
  if (!user) redirect("/login");

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">QR / Label margin setup</h1>
          <p className="text-sm text-gray-600 mt-1">
            Set page margins for Mazus ST-24 (or your label sheets). Values are saved in this
            browser and used on Print QR Codes.
          </p>
        </div>
        <Link href="/inventory/print-codes" className="btn btn-outline btn-sm">
          Back to Print QR
        </Link>
      </div>
      <PrintMarginSetupClient />
    </div>
  );
}

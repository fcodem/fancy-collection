import Link from "next/link";
import DressAvailabilityScanner from "@/components/DressAvailabilityScanner";
import { getCurrentUserReadOnly, isOwner } from "@/lib/auth";

export default async function ScanDressAvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  const scanAvailabilityMode = mode === "scan-availability";
  const user = await getCurrentUserReadOnly();

  return (
    <div
      data-scan-mode={scanAvailabilityMode ? "scan-availability" : undefined}
    >
      <div
        className="card"
        style={{ marginBottom: 16, padding: 8, display: "flex", gap: 8, flexWrap: "wrap" }}
        aria-label="Dress Checker modes"
      >
        <Link href="/inventory/search" prefetch={false} className="btn btn-outline btn-sm">
          AI / Photo Dress Checker
        </Link>
        <span className="btn btn-primary btn-sm" aria-current="page">
          <i className="fa-solid fa-qrcode" /> Scan Dress Availability
        </span>
      </div>
      <DressAvailabilityScanner canManageScanCodes={user ? isOwner(user) : false} />
    </div>
  );
}

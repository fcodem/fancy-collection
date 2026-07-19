import Link from "next/link";
import DressAvailabilityScanner from "@/components/DressAvailabilityScanner";

export default function ScanDressAvailabilityPage() {
  return (
    <div>
      <div
        className="card"
        style={{ marginBottom: 16, padding: 8, display: "flex", gap: 8, flexWrap: "wrap" }}
        aria-label="Dress Checker modes"
      >
        <Link href="/inventory/search" className="btn btn-outline btn-sm">
          AI / Photo Dress Checker
        </Link>
        <span className="btn btn-primary btn-sm" aria-current="page">
          <i className="fa-solid fa-qrcode" /> Scan Dress Availability
        </span>
      </div>
      <DressAvailabilityScanner />
    </div>
  );
}

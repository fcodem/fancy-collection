import Link from "next/link";
import InventorySearchClient from "@/components/InventorySearchClient";

export default async function InventorySearchPage() {
  return (
    <div>
      <div
        className="card"
        style={{ marginBottom: 16, padding: 8, display: "flex", gap: 8, flexWrap: "wrap" }}
        aria-label="Dress Checker modes"
      >
        <span className="btn btn-primary btn-sm" aria-current="page">
          AI / Photo Dress Checker
        </span>
        <Link href="/inventory/search/scan" prefetch={false} className="btn btn-outline btn-sm">
          <i className="fa-solid fa-qrcode" /> Scan Dress Availability
        </Link>
      </div>
      <InventorySearchClient />
    </div>
  );
}

import { redirect } from "next/navigation";

/** Preferred entry URL for Scan Dress Availability — forwards to the scanner page. */
export default async function DressCheckerPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  const query = mode === "scan-availability" ? "?mode=scan-availability" : "";
  redirect(`/inventory/search/scan${query}`);
}

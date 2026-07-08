import { jsonOk, requireOwner, isResponse } from "@/lib/api";
import { exportDressCheckerCorrections } from "@/lib/dressCheckerCorrections";

export async function GET() {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const rows = await exportDressCheckerCorrections();
  return jsonOk({
    exported_at: new Date().toISOString(),
    count: rows.length,
    corrections: rows,
  });
}

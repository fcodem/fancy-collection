import { buildFullBackup } from "@/lib/backupData";
import { requireOwner, isResponse } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const backup = await buildFullBackup(user.username);
  const dateTag = new Date().toISOString().slice(0, 10);
  const json = JSON.stringify(backup, null, 2);

  return new Response(json, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="fancy-collection-backup-${dateTag}.json"`,
    },
  });
}

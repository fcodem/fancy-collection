import { getCurrentUser, getSession } from "@/lib/auth";
import { jsonOk } from "@/lib/api";

export async function GET() {
  const user = await getCurrentUser();
  const session = await getSession();
  return jsonOk({
    active: !!user,
    user: user ? { id: user.id, username: user.username, role: user.role } : null,
    pendingLoginToken: session.pendingLoginToken || null,
  });
}

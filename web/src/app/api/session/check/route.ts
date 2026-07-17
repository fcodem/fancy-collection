import { getCurrentUser, getSession } from "@/lib/auth";
import { jsonOk } from "@/lib/api";

export async function GET() {
  const started = Date.now();
  // getCurrentUser already loads the iron-session once; only fetch session again
  // when we need pendingLoginToken for staff approval flows.
  const user = await getCurrentUser();
  let pendingLoginToken: string | null = null;
  if (!user) {
    const session = await getSession();
    pendingLoginToken = session.pendingLoginToken || null;
  }
  const totalMs = Date.now() - started;
  if (totalMs > 500 || process.env.NODE_ENV !== "production") {
    console.log(`[perf] route=/api/session/check totalMs=${totalMs}`);
  }
  return jsonOk({
    active: !!user,
    user: user ? { id: user.id, username: user.username, role: user.role } : null,
    pendingLoginToken,
  });
}

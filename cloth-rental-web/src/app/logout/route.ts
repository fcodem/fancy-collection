import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { endUserSession, PENDING_LOGIN_COOKIE, SESSION_COOKIE } from "@/lib/auth";

export async function GET() {
  const cookieStore = await cookies();
  const sid = cookieStore.get(SESSION_COOKIE)?.value;
  if (sid) await endUserSession(sid);
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete(PENDING_LOGIN_COOKIE);
  redirect("/login");
}

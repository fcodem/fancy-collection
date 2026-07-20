import prisma from "@/lib/prisma";
import { jsonOk, requireOwner, isResponse } from "@/lib/api";

export async function GET() {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  const users = await prisma.user.findMany({
    where: { staffId: { not: null } },
    select: { id: true, username: true, role: true, staffId: true },
    orderBy: { username: "asc" },
  });
  return jsonOk({ users });
}

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { requireOwner, isResponse, jsonOk } from "@/lib/api";

export const dynamic = "force-dynamic";

async function ownerUsernames(): Promise<string[]> {
  const owners = await prisma.user.findMany({
    where: { role: "owner" },
    select: { username: true },
  });
  return owners.map((o) => o.username);
}

export async function GET(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(10, parseInt(sp.get("limit") || "50", 10)));
  const entity = sp.get("entity") || undefined;
  const action = sp.get("action") || undefined;
  const username = sp.get("username") || undefined;
  const search = sp.get("q") || undefined;
  const includeOwner = sp.get("include_owner") === "1" || sp.get("include_owner") === "true";

  const and: Prisma.ActivityLogWhereInput[] = [];
  if (entity) and.push({ entity });
  if (action) and.push({ action });
  if (username) and.push({ username });
  if (search) {
    and.push({
      OR: [{ label: { contains: search } }, { username: { contains: search } }],
    });
  }
  if (!includeOwner) {
    const owners = await ownerUsernames();
    if (owners.length) and.push({ username: { notIn: owners } });
  }

  const where: Prisma.ActivityLogWhereInput = and.length ? { AND: and } : {};

  const [logs, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.activityLog.count({ where }),
  ]);

  return jsonOk({
    logs: logs.map((l) => ({
      id: l.id,
      username: l.username,
      action: l.action,
      entity: l.entity,
      entityId: l.entityId,
      label: l.label,
      dataBefore: l.dataBefore ? JSON.parse(l.dataBefore) : null,
      dataAfter: l.dataAfter ? JSON.parse(l.dataAfter) : null,
      createdAt: l.createdAt.toISOString(),
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}

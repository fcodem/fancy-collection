import { unstable_cache } from "next/cache";
import prisma from "./prisma";

export const ACTIVE_STAFF_NAMES_TAG = "active-staff-names";

export const getActiveStaffNames = unstable_cache(
  async () => {
    const rows = await prisma.staff.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { name: true },
    });
    return rows.map((r) => r.name);
  },
  [ACTIVE_STAFF_NAMES_TAG],
  { revalidate: 120, tags: [ACTIVE_STAFF_NAMES_TAG] },
);

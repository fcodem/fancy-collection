import { unstable_cache } from "next/cache";
import prisma from "./prisma";

export const getActiveStaffNames = unstable_cache(
  async () => {
    const rows = await prisma.staff.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { name: true },
    });
    return rows.map((r) => r.name);
  },
  ["active-staff-names"],
  { revalidate: 120 },
);

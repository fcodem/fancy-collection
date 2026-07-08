import { readFile } from "fs/promises";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { computeImageFingerprint, designSimilarity, hashSimilarity } from "../src/lib/photoHash";

const QUERY =
  "C:/Users/asus/.cursor/projects/c-Projects-ssdn-soft/assets/c__Users_asus_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_94859627-1d31-4969-953b-6ffadd423997-6f89c1f3-969b-410e-a1be-f1993c3016f6.png";

async function loadPhoto(photo: string) {
  if (photo.startsWith("http")) {
    const res = await fetch(photo);
    return Buffer.from(await res.arrayBuffer());
  }
  return readFile(join(process.cwd(), "public", "uploads", photo.replace(/^uploads\//, "")));
}

function bottomOnly(a: Awaited<ReturnType<typeof computeImageFingerprint>>, b: typeof a) {
  if (!a.bottomHash || !b.bottomHash) return 0;
  const ah = hashSimilarity(a.bottomHash.averageHash, b.bottomHash.averageHash);
  const dh = hashSimilarity(a.bottomHash.differenceHash, b.bottomHash.differenceHash, 64);
  return Math.round(Math.max(ah, dh));
}

async function main() {
  const prisma = new PrismaClient();
  const q = await computeImageFingerprint(await readFile(QUERY));
  for (const sku of ["ITM-1043", "ITM-1036", "ITM-0027"]) {
    const item = await prisma.clothingItem.findFirst({ where: { sku }, select: { name: true, photo: true } });
    if (!item?.photo) continue;
    const s = await computeImageFingerprint(await loadPhoto(item.photo));
    console.log(item.name, {
      design: designSimilarity(q, s),
      bottom: bottomOnly(q, s),
      centre: q.centreHash && s.centreHash
        ? hashSimilarity(q.centreHash.averageHash, s.centreHash.averageHash)
        : 0,
    });
  }
  await prisma.$disconnect();
}

main();

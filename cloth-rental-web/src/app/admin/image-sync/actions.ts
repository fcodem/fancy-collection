"use server";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { saveUpload } from "@/lib/upload";

export type ImageSyncResult =
  | {
      ok: true;
      matched: true;
      itemId: number;
      itemName: string;
      sku: string;
      photo: string;
    }
  | {
      ok: false;
      matched: false;
      error: string;
    };

export async function syncInventoryPhoto(formData: FormData): Promise<ImageSyncResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, matched: false, error: "Please log in to continue." };
  }

  const file = formData.get("file");
  const rawName = String(formData.get("name") ?? "").trim();

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, matched: false, error: "Missing image file." };
  }
  if (!rawName) {
    return { ok: false, matched: false, error: "Missing dress name." };
  }

  try {
    const item = await prisma.clothingItem.findFirst({
      where: {
        name: { equals: rawName, mode: "insensitive" },
      },
      select: { id: true, name: true, sku: true },
    });

    if (!item) {
      return { ok: false, matched: false, error: `No inventory match for "${rawName}"` };
    }

    const storedPath = await saveUpload(file);

    await prisma.clothingItem.update({
      where: { id: item.id },
      data: { photo: storedPath },
    });

    return {
      ok: true,
      matched: true,
      itemId: item.id,
      itemName: item.name,
      sku: item.sku,
      photo: storedPath,
    };
  } catch (err) {
    console.error("[syncInventoryPhoto]", err);
    return { ok: false, matched: false, error: "Upload failed. Please try again." };
  }
}

import { NextRequest } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { jsonError, requireOwner, isResponse } from "@/lib/api";

export async function POST(request: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    return jsonError("Blob storage is not configured", 503);
  }
  try {
    const body = (await request.json()) as HandleUploadBody;
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith("inventory/")) {
          throw new Error("Invalid inventory upload path");
        }
        return {
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp"],
          maximumSizeInBytes: 8 * 1024 * 1024,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId: user.id }),
        };
      },
    });
    return Response.json(response);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Upload authorization failed",
      400,
    );
  }
}

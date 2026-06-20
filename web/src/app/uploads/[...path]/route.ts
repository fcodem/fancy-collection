// TODO: On Vercel, the filesystem is read-only — uploaded images won't persist.
// For production, use Vercel Blob Storage (BLOB_READ_WRITE_TOKEN) or Cloudinary.
// This route only works for local development or pre-deployed static files.
import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

const MIME_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;
  // Prevent directory traversal
  if (segments.some((s) => s === ".." || s === ".")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }
  const filePath = join(process.cwd(), "public", "uploads", ...segments);
  try {
    const buffer = await readFile(filePath);
    const ext = (segments[segments.length - 1]?.split(".").pop() || "").toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}

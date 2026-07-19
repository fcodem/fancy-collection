import { NextRequest } from "next/server";
import { servePrivateMedia } from "@/lib/storage/privateMediaServe";

export async function GET(req: NextRequest) {
  return servePrivateMedia(req, "private-media");
}

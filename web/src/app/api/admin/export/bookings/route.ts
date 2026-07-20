import { streamBookingsCsvResponse } from "@/lib/services/adminOps";
import { requireOwner, isResponse } from "@/lib/api";

export const maxDuration = 60;

export async function GET() {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  return streamBookingsCsvResponse();
}

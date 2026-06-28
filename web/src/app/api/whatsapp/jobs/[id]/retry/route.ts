import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireOwner, isResponse } from "@/lib/api";
import { retryWhatsAppJob } from "@/lib/services/whatsapp/jobQueue";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const { id } = await params;
  const jobId = parseInt(id, 10);
  if (!jobId) return jsonError("Invalid job id");

  try {
    const job = await retryWhatsAppJob(jobId);
    return jsonOk({
      ok: true,
      job: {
        id: job.id,
        status: job.status,
        scheduled_at: job.scheduledAt.toISOString(),
      },
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Retry failed");
  }
}

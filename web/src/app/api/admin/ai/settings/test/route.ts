import { NextRequest } from "next/server";
import { isResponse, jsonError, jsonOk, requireOwner } from "@/lib/api";
import { verifyOpenAiApiKey } from "@/lib/ai/verifyOpenAiKey";
import { resolveOpenAiKey } from "@/lib/ai/aiRuntimeSettings";

/** Test OpenAI key from request body or already-configured sources. */
export async function POST(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const body = (await req.json().catch(() => ({}))) as { openaiApiKey?: string };
  const candidate = body.openaiApiKey?.trim();

  if (candidate) {
    const result = await verifyOpenAiApiKey(candidate);
    if (!result.ok) return jsonError(result.error, 400);
    return jsonOk({ ok: true, source: "request", message: "API key is valid" });
  }

  try {
    const key = await resolveOpenAiKey();
    const result = await verifyOpenAiApiKey(key);
    if (!result.ok) return jsonError(result.error, 400);
    return jsonOk({ ok: true, source: "configured", message: "Configured API key is valid" });
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "No API key configured",
      400,
    );
  }
}

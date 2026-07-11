import OpenAI from "openai";

/** Verify an OpenAI API key by listing models (lightweight auth check). */
export async function verifyOpenAiApiKey(apiKey: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = apiKey.trim();
  if (!trimmed) return { ok: false, error: "API key is empty" };
  if (!trimmed.startsWith("sk-")) {
    return { ok: false, error: "API key should start with sk-" };
  }
  try {
    const client = new OpenAI({ apiKey: trimmed, timeout: 20000, maxRetries: 0 });
    await client.models.list();
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "OpenAI verification failed";
    return { ok: false, error: msg };
  }
}

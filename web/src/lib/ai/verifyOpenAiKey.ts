import OpenAI from "openai";

type VerifyResult =
  | { ok: true }
  | { ok: false; error: string; category: string };

type FullVerifyResult = {
  configured: boolean;
  authenticationPassed: boolean;
  responsesPassed: boolean;
  embeddingsPassed: boolean;
  testedAt: string;
  errorCategory?: string;
  error?: string;
};

function categorizeError(err: unknown): { error: string; category: string } {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("401") || msg.includes("Incorrect API key"))
    return { error: msg, category: "INVALID_KEY" };
  if (msg.includes("429") || msg.includes("quota") || msg.includes("insufficient"))
    return { error: msg, category: "INSUFFICIENT_QUOTA" };
  if (msg.includes("404") || msg.includes("not found") || msg.includes("does not exist"))
    return { error: msg, category: "MODEL_NOT_AVAILABLE" };
  if (msg.includes("ENOTFOUND") || msg.includes("ECONNREFUSED") || msg.includes("timeout"))
    return { error: msg, category: "NETWORK_ERROR" };
  return { error: msg, category: "UNKNOWN_ERROR" };
}

/** Verify an OpenAI API key by listing models (lightweight auth check). */
export async function verifyOpenAiApiKey(apiKey: string): Promise<VerifyResult> {
  const trimmed = apiKey.trim();
  if (!trimmed) return { ok: false, error: "API key is empty", category: "MISSING_KEY" };
  if (!trimmed.startsWith("sk-")) {
    return { ok: false, error: "API key should start with sk-", category: "INVALID_KEY" };
  }
  try {
    const client = new OpenAI({ apiKey: trimmed, timeout: 20000, maxRetries: 0 });
    await client.models.list();
    return { ok: true };
  } catch (err) {
    return { ok: false, ...categorizeError(err) };
  }
}

/** Full end-to-end OpenAI verification: auth + responses + embeddings. */
export async function verifyOpenAiEndToEnd(apiKey: string): Promise<FullVerifyResult> {
  const trimmed = apiKey.trim();
  const testedAt = new Date().toISOString();

  if (!trimmed) {
    return {
      configured: false,
      authenticationPassed: false,
      responsesPassed: false,
      embeddingsPassed: false,
      testedAt,
      errorCategory: "MISSING_KEY",
      error: "No API key provided",
    };
  }

  const client = new OpenAI({ apiKey: trimmed, timeout: 20000, maxRetries: 0 });

  let authenticationPassed = false;
  try {
    await client.models.list();
    authenticationPassed = true;
  } catch (err) {
    const { error, category } = categorizeError(err);
    return {
      configured: true,
      authenticationPassed: false,
      responsesPassed: false,
      embeddingsPassed: false,
      testedAt,
      errorCategory: category,
      error,
    };
  }

  let responsesPassed = false;
  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Reply with only: OK" }],
      max_tokens: 5,
    });
    responsesPassed = Boolean(completion.choices?.[0]?.message?.content);
  } catch (err) {
    const { error, category } = categorizeError(err);
    return {
      configured: true,
      authenticationPassed,
      responsesPassed: false,
      embeddingsPassed: false,
      testedAt,
      errorCategory: category,
      error: `Responses test failed: ${error}`,
    };
  }

  let embeddingsPassed = false;
  try {
    const embedding = await client.embeddings.create({
      model: "text-embedding-3-small",
      input: "test",
    });
    embeddingsPassed = Boolean(embedding.data?.[0]?.embedding?.length);
  } catch (err) {
    const { error, category } = categorizeError(err);
    return {
      configured: true,
      authenticationPassed,
      responsesPassed,
      embeddingsPassed: false,
      testedAt,
      errorCategory: category,
      error: `Embeddings test failed: ${error}`,
    };
  }

  return {
    configured: true,
    authenticationPassed,
    responsesPassed,
    embeddingsPassed,
    testedAt,
  };
}

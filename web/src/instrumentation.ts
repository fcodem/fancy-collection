import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
    const { startDevCron } = await import("./lib/devCronRunner");
    startDevCron();

    const { runStartupHealthCheck } = await import("./lib/dressChecker/deploymentSafety");
    try {
      await runStartupHealthCheck();
      const { runAiQueueSelfHeal } = await import("./lib/dressChecker/queueSelfHeal");
      // Light startup recovery — continue interrupted indexing without blocking boot.
      void runAiQueueSelfHeal({
        source: "startup",
        drainLimit: 5,
        repairLimit: 100,
        resumeDeadLetters: false,
      }).catch((err) => console.warn("[startup] self-heal:", err));
    } catch (err) {
      console.error("[startup] AI deployment safety gate failed:", err);
      // In production, rethrow to fail boot when critical deps are missing.
      if (process.env.NODE_ENV === "production" && process.env.AI_STARTUP_SOFT !== "1") {
        throw err;
      }
    }

    if (process.env.NODE_ENV === "development") {
      const { ensureEnhancementSchema } = await import("./lib/ai/ensureEnhancementSchema");
      ensureEnhancementSchema()
        .then((result) => {
          if (result.applied.length > 0) {
            console.log(`[schema] Applied missing columns: ${result.applied.join(", ")}`);
          }
        })
        .catch((err) => {
          console.warn("[schema] ensureEnhancementSchema failed:", err);
        });
    }
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

/** Captures unhandled errors from Server Components, Server Actions, API routes, and middleware. */
export const onRequestError = Sentry.captureRequestError;

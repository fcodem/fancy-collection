import * as Sentry from "@sentry/nextjs";

function isNextBuildPhase(): boolean {
  return (
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.NEXT_PHASE === "phase-export" ||
    process.argv.includes("build")
  );
}

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");

    // Never run AI/DB startup work during `next build` — it can hang Vercel
    // past the 45-minute build timeout (workers, audits, embedding drains).
    if (isNextBuildPhase()) {
      console.log("[startup] skipping AI health checks during Next.js build");
      return;
    }

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
      // Soft-fail on Vercel so a missing optional AI dep cannot brick deploy boot.
      // Set AI_STARTUP_SOFT=0 to enforce hard fail after Dress Checker is fully ready.
      const soft =
        process.env.AI_STARTUP_SOFT !== "0" ||
        process.env.VERCEL === "1" ||
        process.env.NODE_ENV !== "production";
      if (!soft) {
        throw err;
      }
      console.warn("[startup] continuing despite AI health check failure (soft mode)");
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

export type AiBannerLevel = "info" | "warning" | "error" | null;

export type AiBannerDecision = {
  banner: string | null;
  bannerLevel: AiBannerLevel;
  aiHealthy: boolean;
};

type BannerInput = {
  dbOk: boolean;
  workerStatus: string;
  failedJobCount: number;
  deadLetterCount: number;
  failedProfiles: number;
  staleProfiles: number;
  pendingProfiles: number;
  readyProfiles: number;
  queuePending: number;
  queueProcessing: number;
  queueRetrying: number;
  unindexedWithPhoto: number;
  stuckProcessing: number;
};

export function decideAiIndexingBanner(input: BannerInput): AiBannerDecision {
  if (!input.dbOk) {
    return {
      banner: "Database unreachable.",
      bannerLevel: "error",
      aiHealthy: false,
    };
  }

  if (input.workerStatus === "DISABLED") {
    return {
      banner: "AI indexing is disabled. Inventory and bookings are unaffected.",
      bannerLevel: "info",
      aiHealthy: false,
    };
  }

  const queueActive =
    input.queuePending + input.queueProcessing + input.queueRetrying > 0;
  const indexingInProgress = queueActive || input.pendingProfiles > 0;

  if (input.workerStatus === "OFFLINE" || input.workerStatus === "STALE") {
    const msg =
      input.unindexedWithPhoto > 0
        ? `AI indexing worker is ${input.workerStatus.toLowerCase()}. ${input.unindexedWithPhoto} dress photo(s) still need indexing — open Bulk Image Sync.`
        : "AI indexing is offline or stale. Inventory and bookings are unaffected.";
    return {
      banner: msg,
      bannerLevel: "warning",
      aiHealthy: false,
    };
  }

  const criticalFailures =
    input.deadLetterCount > 0 ||
    (input.failedProfiles > 0 && !indexingInProgress) ||
    (input.failedJobCount > 0 && !indexingInProgress && !queueActive);

  if (criticalFailures) {
    return {
      banner: "AI indexing needs attention — some dresses failed to index. Open AI Indexing Health to retry.",
      bannerLevel: "warning",
      aiHealthy: false,
    };
  }

  if (input.stuckProcessing > 0) {
    return {
      banner: "AI indexing is recovering stuck jobs. Dress search may be briefly inconsistent.",
      bannerLevel: "info",
      aiHealthy: false,
    };
  }

  if (input.unindexedWithPhoto > 0) {
    if (indexingInProgress) {
      return {
        banner: `AI indexing in progress — ${input.unindexedWithPhoto} dress photo(s) remaining. Dress search improves when complete.`,
        bannerLevel: "info",
        aiHealthy: false,
      };
    }
    return {
      banner: `${input.unindexedWithPhoto} dress photo(s) need AI indexing. Open Bulk Image Sync → Index Pending Items.`,
      bannerLevel: "info",
      aiHealthy: false,
    };
  }

  if (input.workerStatus === "DEGRADED" && input.staleProfiles > 0 && queueActive) {
    return {
      banner: "AI profiles are refreshing after updates. Inventory and bookings are unaffected.",
      bannerLevel: "info",
      aiHealthy: false,
    };
  }

  if (input.workerStatus === "DEGRADED") {
    return {
      banner: "AI indexing degraded — inventory and bookings are unaffected.",
      bannerLevel: "warning",
      aiHealthy: false,
    };
  }

  return {
    banner: null,
    bannerLevel: null,
    aiHealthy: true,
  };
}

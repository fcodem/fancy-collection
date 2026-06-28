import * as Sentry from "@sentry/nextjs";
import { baseSentryOptions } from "@/lib/sentryOptions";

Sentry.init({
  ...baseSentryOptions(),
  beforeSend(event, hint) {
    const err = hint.originalException;
    if (
      err instanceof TypeError &&
      typeof err.message === "string" &&
      err.message.toLowerCase().includes("network")
    ) {
      return null;
    }
    return event;
  },
});

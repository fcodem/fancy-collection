import * as Sentry from "@sentry/nextjs";
import { baseSentryOptions } from "@/lib/sentryOptions";

Sentry.init({
  ...baseSentryOptions(),
});

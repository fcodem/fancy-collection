import { redirect, notFound } from "next/navigation";
import { getCurrentUserForLayout } from "@/lib/auth";
import { verifyBookingQrSignature } from "@/lib/bookingQr";
import { resolveBookingQr } from "@/lib/services/qrResolve";

export const dynamic = "force-dynamic";

/**
 * Printed-bill QR entry point: /booking/qr/[token]?s=[signature]&to=[target]
 * Verifies the signature locally, runs ONE indexed lookup via the shared resolver,
 * then redirects. Never backfills or assigns QR tokens during a scan.
 */
export default async function BookingQrRedirectPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ s?: string; to?: string }>;
}) {
  const user = await getCurrentUserForLayout();
  if (!user) redirect("/login");

  const { token } = await params;
  const { s, to } = await searchParams;
  const cleanToken = decodeURIComponent(token);

  // Reject an invalid signature before any booking query.
  if (!verifyBookingQrSignature(cleanToken, s)) {
    notFound();
  }

  const { outcome } = await resolveBookingQr({
    token: cleanToken,
    target: to,
    signatureVerified: true,
  });

  if (!outcome.ok) notFound();

  redirect(outcome.url);
}

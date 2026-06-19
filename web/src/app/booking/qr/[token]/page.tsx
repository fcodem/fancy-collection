import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  backfillMissingQrTokens,
  bookingQrTargetPath,
  ensureBookingQrToken,
  findBookingByQrToken,
  verifyBookingQrSignature,
} from "@/lib/bookingQr";

/** Smart router: scan signed bill QR → open booking / return record by status. */
export default async function BookingQrRedirectPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ s?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  await backfillMissingQrTokens(50);

  const { token } = await params;
  const { s } = await searchParams;
  const cleanToken = decodeURIComponent(token);

  if (!verifyBookingQrSignature(cleanToken, s)) {
    notFound();
  }

  const booking = await findBookingByQrToken(cleanToken);
  if (!booking) notFound();

  if (!booking.qrToken) {
    await ensureBookingQrToken(booking.id);
  }

  redirect(bookingQrTargetPath(booking.status, booking.id));
}

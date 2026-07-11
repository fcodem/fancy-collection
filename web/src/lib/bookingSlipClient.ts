/** Client-side download of the server-rendered booking slip PDF. */
export async function downloadBookingSlipPdf(bookingId: number): Promise<void> {
  const res = await fetch(`/api/booking/${bookingId}/slip/pdf`, { credentials: "same-origin" });
  if (!res.ok) {
    let message = "Could not generate booking slip PDF";
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      /* non-json error body */
    }
    throw new Error(message);
  }

  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const filename = match?.[1] || `BookingSlip_${bookingId}.pdf`;

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

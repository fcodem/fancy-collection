/** Shared secret for headless PDF rendering of slip pages (WhatsApp attachments). */
export function getPdfRenderSecret(): string {
  const explicit =
    process.env.PDF_RENDER_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim();
  if (explicit) return explicit;

  // Local dev: reuse session secret so slip PDFs work without extra env setup.
  if (process.env.NODE_ENV === "development") {
    const session = process.env.SESSION_SECRET?.trim();
    if (session) return session;
  }

  return "";
}
export function isValidPdfRenderSecret(provided: string | null | undefined): boolean {
  const secret = getPdfRenderSecret();
  if (!secret || !provided?.trim()) return false;
  return provided.trim() === secret;
}

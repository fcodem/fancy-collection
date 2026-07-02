import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isValidPdfRenderSecret } from "@/lib/slipPdfAccess";

/** Allow staff session or internal PDF render secret (WhatsApp slip generation). */
export async function requireSlipPageAccess(pdfSecret?: string | null) {
  if (isValidPdfRenderSecret(pdfSecret)) return;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
}

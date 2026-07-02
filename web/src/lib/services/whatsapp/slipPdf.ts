import "server-only";

import path from "path";
import type { DeliverySlipProps } from "@/components/DeliverySlip";
import type { ReturnSlipProps } from "@/components/ReturnSlip";
import type { IncompleteReturnSlipProps } from "@/components/IncompleteReturnSlip";
import type { BookingSlipProps } from "@/components/BookingSlip";

export {
  generateBookingSlipPdf,
  generateDeliverySlipPdf,
  generateReturnSlipPdf,
  generateIncompleteSlipPdf,
  type SlipPdfRenderOptions,
} from "./slipHtmlPdf.server";

async function uploadSlipPdf(
  folder: string,
  filename: string,
  pdfBuffer: Buffer,
): Promise<string> {
  if (process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`${folder}/${filename}`, pdfBuffer, {
      access: "public",
      contentType: "application/pdf",
      addRandomSuffix: false,
    });
    return blob.url;
  }

  const { writeFile, mkdir } = await import("fs/promises");
  const dir = path.join(process.cwd(), "public", "uploads", folder);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), pdfBuffer);
  const base =
    process.env.BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";
  return `${base}/uploads/${folder}/${encodeURIComponent(filename)}`;
}

export function deliverySlipPdfFilename(publicBookingId: string, suffix = ""): string {
  return `DeliverySlip_${publicBookingId}${suffix}.pdf`;
}

export function returnSlipPdfFilename(publicBookingId: string, suffix = ""): string {
  return `ReturnSlip_${publicBookingId}${suffix}.pdf`;
}

export function incompleteSlipPdfFilename(publicBookingId: string, suffix = ""): string {
  return `IncompleteReturn_${publicBookingId}${suffix}.pdf`;
}

export function bookingSlipArchiveFilename(publicBookingId: string): string {
  return `${publicBookingId}.pdf`;
}

export async function uploadDeliverySlipPdf(pdfBuffer: Buffer, publicBookingId: string, suffix = "") {
  return uploadSlipPdf("delivery-slips", deliverySlipPdfFilename(publicBookingId, suffix), pdfBuffer);
}

export async function uploadReturnSlipPdf(pdfBuffer: Buffer, publicBookingId: string, suffix = "") {
  return uploadSlipPdf("return-slips", returnSlipPdfFilename(publicBookingId, suffix), pdfBuffer);
}

export async function uploadIncompleteSlipPdf(
  pdfBuffer: Buffer,
  publicBookingId: string,
  suffix = "",
) {
  return uploadSlipPdf("incomplete-slips", incompleteSlipPdfFilename(publicBookingId, suffix), pdfBuffer);
}

export async function uploadBookingSlipPdf(pdfBuffer: Buffer, publicBookingId: string) {
  return uploadSlipPdf("booking-bills", bookingSlipArchiveFilename(publicBookingId), pdfBuffer);
}

// Re-export prop types for callers that build slip payloads.
export type { BookingSlipProps, DeliverySlipProps, ReturnSlipProps, IncompleteReturnSlipProps };

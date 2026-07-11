"use client";

import dynamic from "next/dynamic";

const SlipActions = dynamic(() => import("./SlipActions"), { ssr: false });

export default function SlipActionsClient({
  bookingId,
  autoPrint = false,
  offerPdfDownload = false,
}: {
  bookingId: number;
  autoPrint?: boolean;
  offerPdfDownload?: boolean;
}) {
  return (
    <SlipActions
      bookingId={bookingId}
      autoPrint={autoPrint}
      offerPdfDownload={offerPdfDownload}
    />
  );
}

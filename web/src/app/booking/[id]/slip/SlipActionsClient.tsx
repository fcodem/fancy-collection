"use client";

import dynamic from "next/dynamic";

const SlipActions = dynamic(() => import("./SlipActions"), { ssr: false });

export default function SlipActionsClient({
  bookingId,
  autoPrint = false,
}: {
  bookingId: number;
  autoPrint?: boolean;
}) {
  return <SlipActions bookingId={bookingId} autoPrint={autoPrint} />;
}

"use client";

import nextDynamic from "next/dynamic";
import PageSkeleton from "@/components/PageSkeleton";

const ImageSyncClient = nextDynamic(() => import("@/components/ImageSyncClient"), {
  ssr: false,
  loading: () => <PageSkeleton rows={4} />,
});

export default function ImageSyncLoader() {
  return <ImageSyncClient />;
}

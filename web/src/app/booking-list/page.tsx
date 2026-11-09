import { Suspense } from "react";
import BookingListClient from "@/components/BookingListClient";
import { getBookingListDataCached } from "@/lib/services/bookingList";
import { todayIso } from "@/lib/constants";
import { addDaysIso } from "@/lib/dateInput";
import { isoDateParam } from "@/lib/urlDateParams";

export const dynamic = "force-dynamic";

function BookingListFallback() {
  return (
    <div className="card" style={{ padding: 24 }}>
      <div
        style={{
          height: 24,
          width: 200,
          background: "var(--border-color)",
          borderRadius: 4,
          marginBottom: 16,
          opacity: 0.4,
        }}
      />
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          style={{
            height: 48,
            background: "var(--border-color)",
            borderRadius: 4,
            marginBottom: 8,
            opacity: 0.2,
          }}
        />
      ))}
    </div>
  );
}

async function BookingListLoader({ today, tomorrow }: { today: string; tomorrow: string }) {
  const initialData = await getBookingListDataCached({
    deliveryDateStr: today,
    returnDateStr: tomorrow,
    page: 1,
    pageSize: 500,
  });

  return (
    <BookingListClient
      initialFrom={today}
      initialTo={tomorrow}
      initialData={initialData}
    />
  );
}

export default async function BookingListPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const today = isoDateParam(sp.from, todayIso());
  const toRaw = isoDateParam(sp.to, addDaysIso(today, 1));
  const tomorrow = toRaw < today ? today : toRaw;

  return (
    <Suspense fallback={<BookingListFallback />}>
      <BookingListLoader today={today} tomorrow={tomorrow} />
    </Suspense>
  );
}

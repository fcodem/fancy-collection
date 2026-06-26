import ServerAppShell from "@/components/ServerAppShell";
import PostponedBookingClient from "@/components/PostponedBookingClient";
import { todayIso } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default function PostponedBookingPage() {
  return (
    <ServerAppShell>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22 }}>
          <i className="fa-solid fa-clock" style={{ marginRight: 10, color: "#E65100" }} />
          Postponed Booking
        </h2>
        <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
          Postpone booked records to release dresses. Advance is held until the record is resolved.
        </p>
      </div>
      <PostponedBookingClient todayIso={todayIso()} />
    </ServerAppShell>
  );
}

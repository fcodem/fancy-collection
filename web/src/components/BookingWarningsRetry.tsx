"use client";

/** Retry control when async warning load fails. */
export default function BookingWarningsRetry({ bookingId }: { bookingId: number }) {
  return (
    <div
      className="booking-warnings-section"
      style={{
        marginTop: 20,
        paddingTop: 16,
        borderTop: "1px solid var(--border)",
      }}
    >
      <p style={{ fontSize: 13, color: "var(--danger)", marginBottom: 10 }}>
        Booking warnings could not be loaded. Retry.
      </p>
      <button
        type="button"
        className="btn btn-outline btn-sm"
        onClick={() => {
          window.location.href = `/booking/${bookingId}`;
        }}
      >
        Retry
      </button>
    </div>
  );
}

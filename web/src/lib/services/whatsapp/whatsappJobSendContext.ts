export type WhatsAppJobSendContext = {
  jobId?: number;
  idempotencyKey?: string | null;
  bookingId?: number | null;
};

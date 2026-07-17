/** Shared mutation API error codes (safe for unit tests / client). */

export type MutationErrorCode =
  | "OPERATION_IN_PROGRESS"
  | "OPERATION_PAYLOAD_MISMATCH"
  | "OPERATION_PREVIOUSLY_FAILED"
  | "OPERATION_SCHEMA_UNAVAILABLE"
  | "INVALID_OPERATION_ID"
  | "BOOKING_CONFLICT"
  | "STALE_RECORD"
  | "ALREADY_DELIVERED"
  | "ALREADY_RETURNED";

export class MutationIdempotencyError extends Error {
  readonly code: MutationErrorCode;
  readonly httpStatus: number;
  readonly retryable: boolean;

  constructor(code: MutationErrorCode, message: string, httpStatus: number, retryable = false) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryable = retryable;
  }
}

export function toPublicErrorPayload(err: MutationIdempotencyError) {
  return {
    error: err.message,
    code: err.code,
    retryable: err.retryable,
  };
}

import { ErrorEnvelope, FoundationError, WireErrorCode, toPublicError } from "../platform/types";

export const canonicalApiErrorCodes: WireErrorCode[] = [
  "VALIDATION_FAILED",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "PRECONDITION_FAILED",
  "RATE_LIMITED",
  "INTERNAL",
];

export function statusForError(code: WireErrorCode): number {
  switch (code) {
    case "VALIDATION_FAILED":
      return 400;
    case "UNAUTHENTICATED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "CONFLICT":
      return 409;
    case "PRECONDITION_FAILED":
      return 412;
    case "RATE_LIMITED":
      return 429;
    case "INTERNAL":
      return 500;
  }
}

export function publicError(error: unknown): { status: number; body: ErrorEnvelope } {
  const envelope = toPublicError(error);
  return {
    status: statusForError(envelope.error.code),
    body: envelope,
  };
}

export function unauthenticatedError(): FoundationError {
  return new FoundationError("UNAUTHENTICATED", "Authentication is required");
}

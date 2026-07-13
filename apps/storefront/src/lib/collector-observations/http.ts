import { NextResponse } from "next/server";

export const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

export type CollectorObservationErrorCode =
  | "SIGN_IN_REQUIRED"
  | "INVALID_INPUT"
  | "OBSERVATION_NOT_FOUND"
  | "REVISION_CONFLICT"
  | "COLLECTOR_OBSERVATIONS_UNAVAILABLE"
  | "COLLECTOR_OBSERVATIONS_ERROR";

export function privateJson(
  body: unknown,
  init: { status?: number; headers?: HeadersInit } = {},
): NextResponse {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...PRIVATE_NO_STORE_HEADERS,
      ...Object.fromEntries(new Headers(init.headers).entries()),
    },
  });
}
export function collectorObservationError(
  code: CollectorObservationErrorCode,
  message: string,
  status: number,
  field?: string,
): NextResponse {
  return privateJson(
    {
      error: {
        code,
        message,
        ...(field ? { field } : {}),
      },
    },
    { status },
  );
}

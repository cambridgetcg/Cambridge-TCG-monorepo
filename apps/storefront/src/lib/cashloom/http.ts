import { NextResponse } from "next/server";

export const CASHLOOM_PRIVATE_NO_STORE = {
  "Cache-Control": "private, no-store",
} as const;

export const CASHLOOM_MAX_JSON_BODY_BYTES = 1024;

export type CashloomJsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: "unsupported_media_type" | "too_large" | "invalid_json" };

export async function readCashloomJsonBody(
  request: Request,
  maxBytes = CASHLOOM_MAX_JSON_BODY_BYTES,
): Promise<CashloomJsonBodyResult> {
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    return { ok: false, reason: "unsupported_media_type" };
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (Number.isFinite(parsedLength) && parsedLength > maxBytes) {
      return { ok: false, reason: "too_large" };
    }
  }

  if (!request.body) return { ok: false, reason: "invalid_json" };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return { ok: false, reason: "too_large" };
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
}

export type CashloomApiErrorCode =
  | "SIGN_IN_REQUIRED"
  | "INVALID_INPUT"
  | "TRADE_NOT_FOUND"
  | "TRADE_FORBIDDEN"
  | "TRADE_NOT_AWAITING_PAYMENT"
  | "PAYMENT_WINDOW_EXPIRED"
  | "CASHLOOM_PROFILE_REQUIRED"
  | "CASHLOOM_PROFILE_DISABLED"
  | "CASHLOOM_PREPARATION_DISABLED"
  | "CASHLOOM_HANDOFF_REQUIRED"
  | "CASHLOOM_HANDOFF_CHANGED"
  | "CASHLOOM_PREPARATION_ALREADY_RECORDED"
  | "CASHLOOM_IDEMPOTENCY_CONFLICT"
  | "SELF_TRADE_NOT_ALLOWED"
  | "CASHLOOM_PREPARATION_UNAVAILABLE"
  | "CASHLOOM_PREPARATION_ERROR"
  | "CASHLOOM_SETTLEMENT_UNAVAILABLE"
  | "CASHLOOM_SETTLEMENT_ERROR";

export function cashloomPrivateJson(
  body: unknown,
  init: { status?: number; headers?: HeadersInit } = {},
): NextResponse {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...CASHLOOM_PRIVATE_NO_STORE,
      ...Object.fromEntries(new Headers(init.headers).entries()),
    },
  });
}

export function cashloomError(
  code: CashloomApiErrorCode,
  message: string,
  status: number,
  field?: string,
): NextResponse {
  return cashloomPrivateJson(
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

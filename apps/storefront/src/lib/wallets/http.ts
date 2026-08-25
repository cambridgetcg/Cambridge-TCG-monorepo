import { NextResponse } from "next/server";
import { readBoundedUtf8Body } from "@/lib/http/read-bounded-utf8-body";
import { asWalletLinkError, WalletLinkError } from "./errors";
import { isWalletStorageUnavailable } from "./db";

export const WALLET_LINK_MAX_REQUEST_BYTES = 16 * 1024;

export const PARTICIPANT_NO_STORE_HEADERS = Object.freeze({
  "Cache-Control": "private, no-store",
  Pragma: "no-cache",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
});

export function participantJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: PARTICIPANT_NO_STORE_HEADERS,
  });
}

export async function readParticipantJson(
  request: Request,
): Promise<
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; response: NextResponse }
> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (
      Number.isFinite(parsedLength) &&
      parsedLength > WALLET_LINK_MAX_REQUEST_BYTES
    ) {
      return {
        ok: false,
        response: participantJson(
          {
            error: {
              code: "REQUEST_TOO_LARGE",
              message: "The wallet-link request exceeds 16 KiB.",
            },
          },
          413,
        ),
      };
    }
  }

  const bodyRead = await readBoundedUtf8Body(
    request,
    WALLET_LINK_MAX_REQUEST_BYTES,
    "wallet-link request",
  );
  if (!bodyRead.ok) {
    const tooLarge = bodyRead.kind === "too_large";
    return {
      ok: false,
      response: participantJson(
        {
          error: {
            code: tooLarge ? "REQUEST_TOO_LARGE" : "INVALID_REQUEST",
            message: tooLarge
              ? "The wallet-link request exceeds 16 KiB."
              : "A valid UTF-8 JSON request body is required.",
          },
        },
        tooLarge ? 413 : 400,
      ),
    };
  }

  try {
    const body = JSON.parse(bodyRead.text) as unknown;
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new Error("wallet-link body must be an object");
    }
    return { ok: true, body: body as Record<string, unknown> };
  } catch {
    return {
      ok: false,
      response: participantJson(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "A valid JSON object request body is required.",
          },
        },
        400,
      ),
    };
  }
}

export function participantError(
  error: unknown,
  context: string,
): NextResponse {
  let safe: WalletLinkError;
  if (isWalletStorageUnavailable(error)) {
    safe = new WalletLinkError(
      "WALLET_LINK_STORAGE_UNAVAILABLE",
      "Wallet linking is not ready because its database migration is unavailable.",
      503,
    );
  } else {
    safe = asWalletLinkError(error);
    if (!(error instanceof WalletLinkError)) {
      console.error(`[account/wallets/${context}] failed:`, error);
    }
  }
  return participantJson(
    { error: { code: safe.code, message: safe.message } },
    safe.status,
  );
}

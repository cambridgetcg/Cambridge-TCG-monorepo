/**
 * POST /api/v1/cards/batch
 *
 * Resolve 1–100 caller-chosen SKUs in one read. This is intentionally not a
 * server-driven listing or bulk-publication door: callers supply every
 * identifier. Each result preserves request order and says whether it was
 * found, invalid, absent from this mirror, or ambiguous inside the mirror.
 *
 * Aggregate rights remain NOASSERTION because the mirror does not retain
 * field-level upstream rights for names, rarity, and set metadata. Price
 * observations and image URLs stay out of this multi-card surface. Cambridge's
 * batch structure and SKU normalization are CC0 separately.
 */

import { NextResponse } from "next/server";
import { errorResponse, jsonResponse, methodNotAllowed } from "@/lib/data-pantry";
import { readBoundedUtf8Body } from "@/lib/http/read-bounded-utf8-body";
import {
  CARD_BATCH_MAX_SKUS,
  CardBatchInputError,
  CardBatchUnavailableError,
  parseCardBatchInput,
  resolveCardBatch,
} from "@/lib/catalog/card-batch";

export const dynamic = "force-dynamic";

const ENDPOINT = "/api/v1/cards/batch";
export const CARD_BATCH_MAX_REQUEST_BYTES = 128 * 1024;

export async function POST(request: Request): Promise<Response> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (
      Number.isFinite(parsedLength) &&
      parsedLength > CARD_BATCH_MAX_REQUEST_BYTES
    ) {
      return errorResponse({
        code: "INVALID_INPUT",
        message: "The card batch request is larger than the accepted body limit.",
        details: {
          max_request_bytes: CARD_BATCH_MAX_REQUEST_BYTES,
          declared_request_bytes: parsedLength,
        },
        status: 413,
        endpoint: ENDPOINT,
      });
    }
  }

  const bodyRead = await readBoundedUtf8Body(
    request,
    CARD_BATCH_MAX_REQUEST_BYTES,
    "card batch body",
  );
  if (!bodyRead.ok) {
    const tooLarge = bodyRead.kind === "too_large";
    return errorResponse({
      code: "INVALID_INPUT",
      message: tooLarge
        ? "The card batch request is larger than the accepted body limit."
        : bodyRead.kind === "invalid_utf8"
          ? "The card batch request must be valid UTF-8 JSON."
          : "The card batch request body could not be read.",
      details: {
        body_error: bodyRead.kind,
        max_request_bytes: CARD_BATCH_MAX_REQUEST_BYTES,
      },
      status: tooLarge ? 413 : 400,
      endpoint: ENDPOINT,
    });
  }

  let body: unknown;
  try {
    body = JSON.parse(bodyRead.text) as unknown;
  } catch {
    return errorResponse({
      code: "INVALID_INPUT",
      message: "The request body must be valid JSON with a skus array.",
      details: { field: "body" },
      endpoint: ENDPOINT,
    });
  }

  try {
    const skus = parseCardBatchInput(body);
    const resolution = await resolveCardBatch(skus);
    const sources = resolution.mirror_queried
      ? [
          "@cambridge-tcg/sku",
          "storefront-rds.card_set_cards",
          "storefront-rds.card_sets",
        ]
      : ["@cambridge-tcg/sku"];
    const sourceLicense = resolution.mirror_queried
      ? ["cc0", "proprietary", "proprietary"]
      : ["cc0"];

    const response = jsonResponse({
      endpoint: ENDPOINT,
      sources,
      source_license: sourceLicense,
      license: "NOASSERTION",
      freshness: 86400,
      no_cache: true,
      extra_meta: {
        section_freshness_seconds: {
          card_identity: 86400,
        },
      },
      does_not_include: [
        "stock, house inventory, a Cambridge sell/buy offer, or a reference price",
        "image URLs, raw CardRush values, source URLs, or other restricted upstream fields",
        "buyer, seller, collector, account, payment, shipping, or receipt data",
        "proof that a missing mirror row does not exist in a publisher or wholesale catalog",
        "a server-driven wildcard or cursor catalog listing, or a complete incremental change feed",
      ],
      data: {
        "@kind": "card-batch",
        limit: CARD_BATCH_MAX_SKUS,
        order: "Results correspond one-for-one with the supplied skus array, including duplicates.",
        absence_semantics:
          "not_in_storefront_mirror means only that this bounded read found no local mirror row; it is not a global nonexistence claim.",
        rights_note:
          "Aggregate rights are NOASSERTION. Cambridge's request/result structure and canonical SKU normalization are CC0-1.0 separately; mirrored card fields retain upstream and publisher rights.",
        ...resolution,
      },
    });
    response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type");
    return response;
  } catch (error) {
    if (error instanceof CardBatchInputError) {
      return errorResponse({
        code: "INVALID_INPUT",
        message: error.message,
        details: { field: error.field, max_skus: CARD_BATCH_MAX_SKUS },
        endpoint: ENDPOINT,
      });
    }
    if (error instanceof CardBatchUnavailableError) {
      return errorResponse({
        code: "SOURCE_UNAVAILABLE",
        message:
          "The storefront card mirror is temporarily unavailable. No supplied SKU is being reported as missing.",
        details: { retryable: true },
        endpoint: ENDPOINT,
      });
    }

    console.error("[/api/v1/cards/batch] unexpected error", error);
    return errorResponse({
      code: "INTERNAL",
      message: "The card batch could not be completed.",
      endpoint: ENDPOINT,
    });
  }
}

export async function GET(): Promise<Response> {
  return methodNotAllowed({
    allowed: ["POST", "OPTIONS"],
    endpoint: ENDPOINT,
    message:
      "Card batches use POST so the bounded SKU list can travel in a JSON body. This operation is read-only.",
  });
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

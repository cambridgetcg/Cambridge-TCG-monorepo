/**
 * Agent-native access to the bounded card batch resolver.
 *
 * The MCP handler calls the shared catalog module directly, so one tool call
 * remains one catalog read rather than becoming one HTTP request per SKU.
 * Per-item absence and invalidity remain data; a mirror outage remains an
 * error, because returning an empty bundle during an outage would be a false
 * catalog claim.
 */

import {
  CardBatchInputError,
  CardBatchUnavailableError,
  parseCardBatchInput,
  resolveCardBatch,
} from "@/lib/catalog/card-batch";
import { ToolError } from "./play-tools";

type CardBatchResolver = typeof resolveCardBatch;

export async function catalogLookupMany(
  _actor: unknown,
  params: unknown,
  resolver: CardBatchResolver = resolveCardBatch,
) {
  try {
    const skus = parseCardBatchInput(params);
    const resolution = await resolver(skus);
    return {
      "@kind": "card-batch",
      license: "NOASSERTION",
      rights_note:
        "Cambridge's request/result structure and canonical SKU normalization are CC0-1.0 separately; mirrored card fields retain upstream and publisher rights.",
      absence_semantics:
        "not_in_storefront_mirror means only that this bounded read found no local mirror row; it is not a global nonexistence claim.",
      does_not_include: [
        "stock, house inventory, a Cambridge sell/buy offer, or a reference price",
        "image URLs, raw source prices, source URLs, or other restricted upstream fields",
        "buyer, seller, collector, account, payment, shipping, or receipt data",
      ],
      ...resolution,
    } as const;
  } catch (error) {
    if (error instanceof CardBatchInputError) {
      throw new ToolError(`invalid card batch input (${error.field}): ${error.message}`, 400);
    }
    if (error instanceof CardBatchUnavailableError) {
      throw new ToolError(
        "The storefront card mirror is temporarily unavailable. No supplied SKU is being reported as missing.",
        503,
      );
    }
    throw error;
  }
}

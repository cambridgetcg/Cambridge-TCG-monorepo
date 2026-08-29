#!/usr/bin/env tsx

import { archiveCardmarketOnePieceDaily } from "../src/lib/datafeed/cardmarket-daily";

function argument(name: string): string | undefined {
  const prefix = `${name}=`;
  const inline = process.argv.slice(2).find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const bucket =
  argument("--bucket")?.trim() ||
  process.env.CARDMARKET_PRICE_EVIDENCE_BUCKET?.trim();
if (!bucket) {
  throw new Error(
    "Pass --bucket=<private-bucket> or CARDMARKET_PRICE_EVIDENCE_BUCKET",
  );
}

const result = await archiveCardmarketOnePieceDaily({
  bucket,
  on_event(event) {
    const detail = event.detail;
    console.error(
      JSON.stringify({
        source: event.source,
        kind: event.kind,
        artifact_kind: detail.artifact_kind ?? null,
        byte_length: detail.byte_length ?? null,
        sha256: detail.sha256 ?? null,
        publication: detail.publication ?? "withheld",
      }),
    );
  },
});

console.log(
  JSON.stringify(
    {
      ...result,
      artifacts: result.artifacts.map((artifact) => ({
        kind: artifact.kind,
        sha256: artifact.sha256,
        byte_length: artifact.byte_length,
        source_stated_at: artifact.source_stated_at,
        retrieved_at: artifact.retrieved_at,
        row_count: artifact.row_count,
        raw: artifact.raw,
        manifest: artifact.manifest,
      })),
    },
    null,
    2,
  ),
);

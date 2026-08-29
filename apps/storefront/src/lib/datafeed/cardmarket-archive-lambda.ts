import { archiveCardmarketOnePieceDaily } from "./cardmarket-daily";

const BUCKET_ENV = "CARDMARKET_PRICE_EVIDENCE_BUCKET";

/** EventBridge target. The event is deliberately ignored: URLs and policy are fixed in code. */
export async function handler(_event: unknown): Promise<unknown> {
  const bucket = process.env[BUCKET_ENV]?.trim();
  if (!bucket) throw new Error("cardmarket_archive_bucket_not_configured");

  const result = await archiveCardmarketOnePieceDaily({
    bucket,
    on_event(event) {
      console.log(JSON.stringify({ component: "cardmarket-archive", ...event }));
    },
  });
  console.log(
    JSON.stringify({
      component: "cardmarket-archive",
      kind: "archive-complete",
      bucket,
      publication_state: result.publication_state,
      artifacts: result.artifacts.map((artifact) => ({
        kind: artifact.kind,
        sha256: artifact.sha256,
        byte_length: artifact.byte_length,
        row_count: artifact.row_count,
        raw_key: artifact.raw.key,
        manifest_key: artifact.manifest.key,
      })),
    }),
  );
  return result;
}

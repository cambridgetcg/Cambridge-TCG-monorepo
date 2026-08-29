import {
  fetchCardmarketPublicFile,
  type CardmarketPublicFileArtifact,
  type CardmarketPublicFileRequest,
} from "@cambridge-tcg/data-ingest/cardmarket";
import type { IngestContext, IngestEvent } from "@cambridge-tcg/data-ingest/types";

import {
  archiveCardmarketPublicFile,
  inspectCardmarketArtifactEnvelope,
  type ArchiveCardmarketPublicFileResult,
  type CardmarketArchiveS3Port,
} from "./cardmarket-archive";

export const CARDMARKET_ONE_PIECE_GAME_ID = 18;
export const CARDMARKET_ONE_PIECE_GAME_SLUG = "one-piece";

export const CARDMARKET_ONE_PIECE_PUBLIC_FILES = Object.freeze([
  Object.freeze({
    kind: "price-guide",
    url: "https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_18.json",
  }),
  Object.freeze({
    kind: "product-list",
    url: "https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_18.json",
  }),
  Object.freeze({
    kind: "product-list",
    url: "https://downloads.s3.cardmarket.com/productCatalog/productList/products_nonsingles_18.json",
  }),
] satisfies readonly CardmarketPublicFileRequest[]);

export interface ArchiveCardmarketOnePieceDailyInput {
  bucket: string;
  signal?: AbortSignal;
  fetch?: typeof globalThis.fetch;
  on_event?: (event: IngestEvent) => void | Promise<void>;
}

export interface CardmarketDailyArchiveItem {
  kind: string;
  source_url: string;
  sha256: string;
  byte_length: number;
  source_stated_at: string;
  retrieved_at: string;
  row_count: number;
  raw: ArchiveCardmarketPublicFileResult["raw"];
  manifest: ArchiveCardmarketPublicFileResult["manifest"];
}

export interface ArchiveCardmarketOnePieceDailyResult {
  schema: "cambridgetcg.cardmarket-daily-archive-result/1";
  source: "cardmarket";
  game: "one-piece";
  publication_state: "withheld";
  artifacts: readonly CardmarketDailyArchiveItem[];
}

type FetchArtifactPort = (
  context: IngestContext,
  request: CardmarketPublicFileRequest,
) => Promise<CardmarketPublicFileArtifact>;

type ArchiveArtifactPort = typeof archiveCardmarketPublicFile;

export interface CardmarketDailyArchiveDependencies {
  fetchArtifact?: FetchArtifactPort;
  archiveArtifact?: ArchiveArtifactPort;
  s3?: CardmarketArchiveS3Port;
}

/**
 * Fetch and privately archive the fixed One Piece Cardmarket public-file set.
 *
 * No caller can choose a URL, game, parser, or publication policy. All source
 * reads finish before the first S3 write so a transient upstream failure does
 * not create an avoidable partial daily acquisition. S3 itself remains an
 * idempotent, content-addressed evidence ledger rather than a transaction.
 */
export async function archiveCardmarketOnePieceDaily(
  input: ArchiveCardmarketOnePieceDailyInput,
  dependencies: CardmarketDailyArchiveDependencies = {},
): Promise<ArchiveCardmarketOnePieceDailyResult> {
  if (!input.bucket.trim()) throw new Error("cardmarket_daily_bucket_required");

  const fetchArtifact = dependencies.fetchArtifact ?? fetchCardmarketPublicFile;
  const archiveArtifact = dependencies.archiveArtifact ?? archiveCardmarketPublicFile;
  const context: IngestContext = {
    ...(input.fetch ? { fetch: input.fetch } : {}),
    ...(input.signal ? { signal: input.signal } : {}),
    ...(input.on_event ? { on_event: input.on_event } : {}),
  };

  const artifacts: CardmarketPublicFileArtifact[] = [];
  for (const request of CARDMARKET_ONE_PIECE_PUBLIC_FILES) {
    artifacts.push(await fetchArtifact(context, request));
  }

  const archived: CardmarketDailyArchiveItem[] = [];
  for (const artifact of artifacts) {
    const envelope = inspectCardmarketArtifactEnvelope(artifact);
    const stored = await archiveArtifact(
      {
        artifact,
        bucket: input.bucket,
        game_slug: CARDMARKET_ONE_PIECE_GAME_SLUG,
        cardmarket_game_id: CARDMARKET_ONE_PIECE_GAME_ID,
      },
      dependencies.s3 ? { s3: dependencies.s3 } : {},
    );
    archived.push({
      kind: stored.artifact_kind,
      source_url: artifact.source_url,
      sha256: artifact.sha256,
      byte_length: artifact.byte_length,
      source_stated_at: envelope.source_stated_at,
      retrieved_at: artifact.retrieved_at,
      row_count: envelope.row_count,
      raw: stored.raw,
      manifest: stored.manifest,
    });
  }

  return Object.freeze({
    schema: "cambridgetcg.cardmarket-daily-archive-result/1",
    source: "cardmarket",
    game: "one-piece",
    publication_state: "withheld",
    artifacts: Object.freeze(archived.map((item) => Object.freeze(item))),
  });
}

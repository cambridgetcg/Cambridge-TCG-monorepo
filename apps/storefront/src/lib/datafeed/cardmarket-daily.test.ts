import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type { CardmarketPublicFileArtifact } from "@cambridge-tcg/data-ingest/cardmarket";
import {
  archiveCardmarketOnePieceDaily,
  CARDMARKET_ONE_PIECE_PUBLIC_FILES,
} from "./cardmarket-daily";

function artifact(
  url: string,
  index: number,
): CardmarketPublicFileArtifact {
  const rowKey = url.includes("priceGuide") ? "priceGuides" : "products";
  const bytes = new TextEncoder().encode(
    JSON.stringify({
      version: 1,
      createdAt: `2026-08-${String(26 + index).padStart(2, "0")}T02:42:18+0200`,
      [rowKey]: [{ idProduct: index + 1 }],
    }),
  );
  return {
    kind: url.includes("priceGuide") ? "price-guide" : "product-list",
    source_url: url,
    final_url: url,
    bytes,
    byte_length: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    retrieved_at: "2026-08-29T09:37:43.000Z",
    headers: {
      content_type: "application/json",
      content_length: bytes.byteLength,
      content_encoding: null,
      etag: null,
      last_modified: null,
      cache_control: null,
    },
    provenance: {
      source: "cardmarket",
      as_of: "2026-08-29T09:37:43.000Z",
      retrieved_at: "2026-08-29T09:37:43.000Z",
      via_proxy: null,
    },
  };
}

describe("Cardmarket One Piece daily archive", () => {
  it("fetches the exact fixed three-file set before writing withheld artifacts", async () => {
    const order: string[] = [];
    const fetchArtifact = vi.fn(async (_context, request) => {
      order.push(`fetch:${request.url}`);
      return artifact(request.url, order.length - 1);
    });
    const archiveArtifact = vi.fn(async (input) => {
      order.push(`archive:${input.artifact.source_url}`);
      const path = new URL(input.artifact.source_url).pathname;
      const kind = path.includes("priceGuide")
        ? "price-guide"
        : path.includes("nonsingles")
          ? "product-list-nonsingles"
          : "product-list-singles";
      return {
        raw: {
          bucket: input.bucket,
          key: `raw/${kind}/${input.artifact.sha256}.json`,
          version_id: "raw-version",
          created: true,
        },
        manifest: {
          bucket: input.bucket,
          key: `manifests/${kind}/${input.artifact.sha256}.json`,
          version_id: "manifest-version",
          sha256: "f".repeat(64),
          created: true,
        },
        artifact_kind: kind,
        publication_state: "withheld",
      } as const;
    });

    const result = await archiveCardmarketOnePieceDaily(
      { bucket: "private-evidence" },
      { fetchArtifact, archiveArtifact },
    );

    expect(fetchArtifact.mock.calls.map(([, request]) => request)).toEqual(
      CARDMARKET_ONE_PIECE_PUBLIC_FILES,
    );
    expect(order.slice(0, 3).every((entry) => entry.startsWith("fetch:"))).toBe(
      true,
    );
    expect(order.slice(3).every((entry) => entry.startsWith("archive:"))).toBe(
      true,
    );
    expect(result).toMatchObject({
      schema: "cambridgetcg.cardmarket-daily-archive-result/1",
      source: "cardmarket",
      game: "one-piece",
      publication_state: "withheld",
    });
    expect(result.artifacts).toHaveLength(3);
    expect(result.artifacts.map((item) => item.row_count)).toEqual([1, 1, 1]);
  });

  it("performs no archive writes when any official read fails", async () => {
    let call = 0;
    const fetchArtifact = vi.fn(async (_context, request) => {
      call += 1;
      if (call === 2) throw new Error("upstream_unavailable");
      return artifact(request.url, call);
    });
    const archiveArtifact = vi.fn();

    await expect(
      archiveCardmarketOnePieceDaily(
        { bucket: "private-evidence" },
        { fetchArtifact, archiveArtifact },
      ),
    ).rejects.toThrow("upstream_unavailable");
    expect(fetchArtifact).toHaveBeenCalledTimes(2);
    expect(archiveArtifact).not.toHaveBeenCalled();
  });
});
